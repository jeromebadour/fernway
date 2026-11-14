<?php
/**
 * The form: drawn on the server so it works without JavaScript, sent to Fernway from the server so the key stays
 * here, and swapped for a receipt once Fernway has the lead. One renderer for the block and the Elementor widget.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Form {

	const FIELDS     = array( 'address', 'name', 'phone', 'email', 'company', 'slot', 'message' );
	const PER_HOUR   = 6;
	const DAYS_SHOWN = 5;

	public static function boot(): void {
		add_action( 'init', array( self::class, 'register' ) );
		add_action( 'admin_post_nopriv_fernway_send', array( self::class, 'post' ) );
		add_action( 'admin_post_fernway_send', array( self::class, 'post' ) );
	}

	public static function register(): void {
		wp_register_style( 'fernway-form', FERNWAY_URL . 'assets/form.css', array(), FERNWAY_VERSION );
		wp_register_script( 'fernway-form-view', FERNWAY_URL . 'assets/form.js', array(), FERNWAY_VERSION, array( 'strategy' => 'defer', 'in_footer' => true ) );
		wp_register_script( 'fernway-form-editor', FERNWAY_URL . 'blocks/form/editor.js', array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-server-side-render', 'wp-i18n' ), FERNWAY_VERSION, true );
		register_block_type( FERNWAY_DIR . 'blocks/form', array( 'render_callback' => array( self::class, 'render' ) ) );
	}

	/** The words a form uses unless the block gives its own. */
	public static function labels( array $own = array() ): array {
		$base = array(
			'address' => __( 'Address', 'fernway' ),
			'name'    => __( 'Your name', 'fernway' ),
			'phone'   => __( 'Phone', 'fernway' ),
			'email'   => __( 'Email', 'fernway' ),
			'company' => __( 'Company', 'fernway' ),
			'message' => __( 'Message', 'fernway' ),
			'slot'    => __( 'Which day suits you?', 'fernway' ),
		);
		return array_merge( $base, array_intersect_key( array_filter( array_map( 'strval', $own ) ), $base ) );
	}

	/** A form's settings, cleaned: the block's attributes or the widget's. */
	public static function settings( array $a ): array {
		$fields = array_values( array_intersect( self::FIELDS, array_map( 'strval', (array) ( $a['fields'] ?? array() ) ) ) );
		$route  = (string) ( $a['route'] ?? '' );
		return array(
			'route'   => preg_match( '/^[a-z0-9-]{1,40}$/', $route ) ? $route : (string) get_option( 'fernway_route', '' ),
			'fields'  => $fields ? $fields : array( 'name', 'email', 'phone', 'message' ),
			'title'   => (string) ( $a['title'] ?? '' ),
			'submit'  => (string) ( $a['submitLabel'] ?? '' ),
			'note'    => (string) ( $a['note'] ?? '' ),
			'variant' => 'compact' === ( $a['variant'] ?? '' ) ? 'compact' : 'full',
			'labels'  => self::labels( (array) ( $a['labels'] ?? array() ) ),
		);
	}

	/** The route's free times grouped by day in the site's time zone: [ 'Y-m-d' => [ 'am' => iso|null, 'pm' => iso|null ] ]. */
	public static function days( string $route ): ?array {
		$cache = get_transient( 'fernway_slots_' . $route );
		if ( false === $cache ) {
			$r = Client::call( 'GET', '/api/v1/routes/' . rawurlencode( $route ) . '/slots' );
			if ( 200 !== $r['status'] ) {
				return null;
			}
			$cache = array_map( 'strval', (array) ( $r['json']['slots'] ?? array() ) );
			set_transient( 'fernway_slots_' . $route, $cache, MINUTE_IN_SECONDS );
		}
		$tz    = wp_timezone();
		$first = array();
		foreach ( $cache as $iso ) {
			$t = date_create_immutable( $iso );
			if ( ! $t || ! self::in_hours( $t ) ) {
				continue;
			}
			$local = $t->setTimezone( $tz );
			$day   = $local->format( 'Y-m-d' );
			$half  = (int) $local->format( 'G' ) < 12 ? 'am' : 'pm';
			if ( empty( $first[ $day ][ $half ] ) ) {
				$first[ $day ][ $half ] = $iso;
			}
		}
		// The next working days, a full day shown crossed out rather than skipped, so the visitor sees why.
		$out = array();
		$d   = new \DateTimeImmutable( 'tomorrow', $tz );
		for ( $i = 0; count( $out ) < self::DAYS_SHOWN && $i < 21; $i++, $d = $d->modify( '+1 day' ) ) {
			if ( (int) $d->format( 'N' ) >= 6 && empty( $first[ $d->format( 'Y-m-d' ) ] ) ) {
				continue;
			}
			$k         = $d->format( 'Y-m-d' );
			$out[ $k ] = array( 'am' => $first[ $k ]['am'] ?? null, 'pm' => $first[ $k ]['pm'] ?? null );
		}
		return $out;
	}

	/** Whether a time is inside the hours the site offers (Settings, Fernway), in the site's time zone. */
	public static function in_hours( \DateTimeInterface $t ): bool {
		$hours = (string) get_option( 'fernway_hours', '' );
		if ( ! preg_match( '/^(\d{1,2})-(\d{1,2})$/', $hours, $m ) ) {
			return true;
		}
		$h = (int) ( new \DateTimeImmutable( '@' . $t->getTimestamp() ) )->setTimezone( wp_timezone() )->format( 'G' );
		return $h >= (int) $m[1] && $h < (int) $m[2];
	}

	/** Signs a waybill number for this site, so the receipt can be read back only by whoever sent it. */
	public static function sign( string $number ): string {
		return substr( hash_hmac( 'sha256', 'fernway|' . $number, wp_salt( 'auth' ) ), 0, 24 );
	}

	public static function signed( string $number, string $sig ): bool {
		return '' !== $sig && hash_equals( self::sign( $number ), $sig );
	}

	/**
	 * Takes a send (from the REST route or a plain form post): checks it, limits it, sends it, logs it.
	 *
	 * @return array{ok:bool, status:int, problems?:array<string,string>, number?:string, sig?:string, booked?:?string, area?:?bool, first?:string}
	 */
	public static function send( array $in, array $settings, string $page ): array {
		if ( '' !== trim( (string) ( $in['fw_website'] ?? '' ) ) ) {
			// The hidden trap field: a person never fills it. Answered like a success, and nothing is sent.
			return array( 'ok' => true, 'status' => 200, 'number' => '', 'sig' => '' );
		}
		$ip    = preg_replace( '/[^0-9a-f:.]/i', '', (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ) );
		$bucket = 'fernway_rate_' . md5( $ip . '|' . gmdate( 'YmdH' ) );
		$count = (int) get_transient( $bucket );
		if ( $count >= self::PER_HOUR ) {
			Log::add( array( 'route' => $settings['route'], 'outcome' => 'limited', 'status' => 429, 'page' => $page ) );
			return array( 'ok' => false, 'status' => 429, 'problems' => array( 'form' => __( 'That\'s a lot of sends from here in an hour. Please call us instead, or try again later.', 'fernway' ) ) );
		}

		// A day and a half-day picked without the exact time (the script didn't run to the end): work the time out here.
		if ( '' === trim( (string) ( $in['slot'] ?? '' ) ) && ! empty( $in['fw_day'] ) && ! empty( $in['fw_half'] ) ) {
			$days        = self::days( $settings['route'] );
			$in['slot'] = (string) ( $days[ (string) $in['fw_day'] ][ 'am' === $in['fw_half'] ? 'am' : 'pm' ] ?? '' );
		}
		$lead = Lead::from_form( $in, $settings['fields'], (string) get_option( 'fernway_country', 'US' ) );
		// A time from outside the hours offered (an old page, or a hand-made post) is refused like a taken one.
		$when = $lead['slot'] ? date_create_immutable( (string) $lead['slot'] ) : false;
		if ( $lead['ok'] && $when && ! self::in_hours( $when ) ) {
			$lead['ok']               = false;
			$lead['problems']['slot'] = __( 'We don\'t book at that time. Please pick a morning or an afternoon from the list.', 'fernway' );
		}
		if ( ! $lead['ok'] ) {
			return array( 'ok' => false, 'status' => 422, 'problems' => $lead['problems'] );
		}
		set_transient( $bucket, $count + 1, HOUR_IN_SECONDS );

		$key  = preg_match( '/^[A-Za-z0-9-]{8,80}$/', (string) ( $in['fw_key'] ?? '' ) ) ? (string) $in['fw_key'] : wp_generate_uuid4();
		$body = array( 'idempotencyKey' => 'wp-' . $key, 'source' => 'wordpress', 'route' => $settings['route'], 'contact' => $lead['contact'] );
		if ( $lead['slot'] ) {
			$body['slot'] = $lead['slot'];
		}
		$r = Client::call( 'POST', '/api/v1/leads', $body );

		if ( 201 === $r['status'] || 200 === $r['status'] ) {
			$number = (string) ( $r['json']['number'] ?? '' );
			set_transient( 'fernway_receipt_' . md5( $number ), (string) ( $r['json']['links']['receipt'] ?? '' ), 30 * DAY_IN_SECONDS );
			delete_transient( 'fernway_slots_' . $settings['route'] );
			Log::add( array( 'route' => $settings['route'], 'outcome' => 200 === $r['status'] ? 'duplicate' : 'sent', 'status' => $r['status'], 'number' => $number, 'page' => $page ) );
			return array( 'ok' => true, 'status' => $r['status'], 'number' => $number, 'sig' => self::sign( $number ), 'booked' => $lead['slot'], 'area' => $lead['area'], 'first' => (string) ( $lead['contact']['firstName'] ?? '' ) );
		}
		if ( 409 === $r['status'] ) {
			delete_transient( 'fernway_slots_' . $settings['route'] );
			Log::add( array( 'route' => $settings['route'], 'outcome' => 'taken', 'status' => 409, 'problem' => Client::problem( $r ), 'page' => $page ) );
			return array( 'ok' => false, 'status' => 409, 'problems' => array( 'slot' => __( 'Someone just took that time. Please pick another.', 'fernway' ) ) );
		}
		$outcome = 0 === $r['status'] || $r['status'] >= 500 ? 'unreachable' : 'refused';
		Log::add( array( 'route' => $settings['route'], 'outcome' => $outcome, 'status' => $r['status'], 'problem' => Client::problem( $r ), 'page' => $page ) );
		return array(
			'ok'       => false,
			'status'   => 'unreachable' === $outcome ? 503 : 422,
			'problems' => array( 'form' => 'unreachable' === $outcome
				? __( 'We couldn\'t send that just now. Nothing was lost on your side: please try again in a minute.', 'fernway' )
				: __( 'We couldn\'t take that. Please check the form, or call us.', 'fernway' ) ),
		);
	}

	/** The form's settings as it was drawn, if they really came from this site (signed when drawn). */
	public static function verified( $json, $sig ): ?array {
		$settings = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $settings ) || ! is_string( $sig ) || ! hash_equals( substr( hash_hmac( 'sha256', wp_json_encode( $settings ), wp_salt( 'auth' ) ), 0, 24 ), $sig ) ) {
			return null;
		}
		return self::settings( array( 'route' => $settings['route'] ?? '', 'fields' => $settings['fields'] ?? array(), 'variant' => $settings['variant'] ?? 'full' ) );
	}

	/** A plain form post, for visitors without JavaScript: send, then back to the page with the receipt or the problems. */
	public static function post(): void {
		$back     = wp_validate_redirect( wp_get_referer() ? (string) wp_get_referer() : home_url( '/' ), home_url( '/' ) );
		$settings = self::verified( wp_unslash( (string) ( $_POST['fw_settings'] ?? '' ) ), (string) ( $_POST['fw_settings_sig'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( null === $settings ) {
			wp_safe_redirect( $back );
			exit;
		}
		$in  = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification.Missing
		$res = self::send( $in, $settings, (string) wp_parse_url( $back, PHP_URL_PATH ) );
		$id  = sanitize_key( (string) ( $in['fw_id'] ?? 'form' ) );
		if ( $res['ok'] ) {
			$url = add_query_arg( array( 'fernway_sent' => rawurlencode( (string) $res['number'] ), 'fernway_t' => $res['sig'], 'fernway_b' => $res['booked'] ? rawurlencode( (string) $res['booked'] ) : false, 'fernway_n' => rawurlencode( (string) ( $res['first'] ?? '' ) ) ), remove_query_arg( array( 'fernway_sent', 'fernway_t', 'fernway_b', 'fernway_n', 'fernway_err' ), $back ) );
		} else {
			$token = wp_generate_password( 16, false );
			set_transient( 'fernway_err_' . $token, array( 'problems' => $res['problems'], 'values' => array_intersect_key( $in, array_flip( self::FIELDS ) ) ), 10 * MINUTE_IN_SECONDS );
			$url = add_query_arg( 'fernway_err', $token, remove_query_arg( array( 'fernway_sent', 'fernway_t', 'fernway_b', 'fernway_n' ), $back ) );
		}
		wp_safe_redirect( $url . '#fernway-' . $id );
		exit;
	}

	/** The block's render callback. */
	public static function render( array $attrs ): string {
		return self::html( self::settings( $attrs ), $attrs['className'] ?? '' );
	}

	/** The form, or its receipt when the page was reached right after sending it without JavaScript. */
	public static function html( array $s, string $class = '' ): string {
		static $n = 0;
		++$n;
		wp_enqueue_style( 'fernway-form' );
		wp_enqueue_script( 'fernway-form-view' );
		$id = 'f' . $n;

		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		$sent = isset( $_GET['fernway_sent'], $_GET['fernway_t'] ) ? sanitize_text_field( wp_unslash( $_GET['fernway_sent'] ) ) : '';
		if ( '' !== $sent && self::signed( $sent, sanitize_text_field( wp_unslash( $_GET['fernway_t'] ) ) ) && 1 === $n ) {
			$booked = isset( $_GET['fernway_b'] ) ? sanitize_text_field( wp_unslash( $_GET['fernway_b'] ) ) : '';
			$first  = isset( $_GET['fernway_n'] ) ? sanitize_text_field( wp_unslash( $_GET['fernway_n'] ) ) : '';
			return self::receipt_html( $s, $id, $sent, sanitize_text_field( wp_unslash( $_GET['fernway_t'] ) ), $booked, $first, $class );
		}
		$err = array( 'problems' => array(), 'values' => array() );
		if ( isset( $_GET['fernway_err'] ) && 1 === $n ) {
			$got = get_transient( 'fernway_err_' . sanitize_key( wp_unslash( $_GET['fernway_err'] ) ) );
			if ( is_array( $got ) ) {
				$err = $got;
			}
		}
		// phpcs:enable

		if ( '' === $s['route'] || ! Client::has_key() ) {
			return current_user_can( 'manage_options' )
				? '<div class="fernway fw-setup">' . esc_html__( 'This Fernway form needs an API key and a route: Settings, Fernway. Visitors don\'t see this note.', 'fernway' ) . '</div>'
				: '';
		}

		$l     = $s['labels'];
		$p     = $err['problems'];
		$val   = static fn( string $k ): string => esc_attr( (string) ( $err['values'][ $k ] ?? '' ) );
		$days  = in_array( 'slot', $s['fields'], true ) ? self::days( $s['route'] ) : null;
		$area  = (string) get_option( 'fernway_area', '' );
		$wide  = array( 'address', 'email', 'message', 'slot' );
		$cls   = trim( 'fernway fw-' . $s['variant'] . ' ' . $class );
		$sig   = substr( hash_hmac( 'sha256', wp_json_encode( $s ), wp_salt( 'auth' ) ), 0, 24 );
		$icons = array( 'address' => 'pin', 'name' => 'person', 'phone' => 'phone', 'email' => 'mail', 'company' => 'building', 'message' => 'note' );
		$types = array( 'address' => 'text', 'name' => 'text', 'phone' => 'tel', 'email' => 'email', 'company' => 'text' );
		$auto  = array( 'address' => 'street-address', 'name' => 'name', 'phone' => 'tel', 'email' => 'email', 'company' => 'organization' );

		ob_start();
		?>
		<div class="<?php echo esc_attr( $cls ); ?>" id="fernway-<?php echo esc_attr( $id ); ?>" data-route="<?php echo esc_attr( $s['route'] ); ?>" data-area="<?php echo esc_attr( $area ); ?>" data-rest="<?php echo esc_url( rest_url( 'fernway/v1/' ) ); ?>" data-tz="<?php echo esc_attr( wp_timezone_string() ); ?>" data-words="<?php echo esc_attr( wp_json_encode( array( 'in' => __( 'in our area', 'fernway' ), 'out' => __( 'we\'ll confirm we cover it', 'fernway' ), 'morning' => __( 'morning', 'fernway' ), 'afternoon' => __( 'afternoon', 'fernway' ), 'from' => __( 'from', 'fernway' ), 'copied' => __( 'Copied', 'fernway' ) ) ) ); ?>">
			<?php if ( 'full' === $s['variant'] && '' !== $s['title'] ) : ?>
				<div class="fw-head"><p class="fw-title"><?php echo esc_html( $s['title'] ); ?></p><p class="fw-meta"><?php esc_html_e( 'takes 2 minutes', 'fernway' ); ?></p></div>
			<?php endif; ?>
			<form class="fw-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" novalidate>
				<input type="hidden" name="action" value="fernway_send" />
				<input type="hidden" name="fw_id" value="<?php echo esc_attr( $id ); ?>" />
				<input type="hidden" name="fw_key" value="" />
				<input type="hidden" name="fw_settings" value="<?php echo esc_attr( wp_json_encode( $s ) ); ?>" />
				<input type="hidden" name="fw_settings_sig" value="<?php echo esc_attr( $sig ); ?>" />
				<p class="fw-trap" aria-hidden="true"><label><?php esc_html_e( 'Leave this empty', 'fernway' ); ?> <input type="text" name="fw_website" tabindex="-1" autocomplete="off" /></label></p>
				<?php if ( ! empty( $p['form'] ) ) : ?>
					<p class="fw-problem fw-problem-form" role="alert"><?php echo esc_html( $p['form'] ); ?></p>
				<?php endif; ?>
				<div class="fw-fields">
				<?php foreach ( $s['fields'] as $f ) : ?>
					<?php if ( 'slot' === $f ) : ?>
						<fieldset class="fw-slot fw-w">
							<legend><?php echo esc_html( $l['slot'] ); ?></legend>
							<?php if ( null === $days ) : ?>
								<p class="fw-problem"><?php esc_html_e( 'Our diary can\'t be read just now. Send the form and we\'ll call to fix a time.', 'fernway' ); ?></p>
							<?php else : ?>
								<input type="hidden" name="slot" value="" class="fw-slot-value" />
								<div class="fw-days fw-js-only">
								<?php foreach ( $days as $day => $halves ) : $dt = new \DateTimeImmutable( $day, wp_timezone() ); $open = $halves['am'] || $halves['pm']; ?>
									<label class="fw-day<?php echo $open ? '' : ' is-full'; ?>">
										<input type="radio" name="fw_day" value="<?php echo esc_attr( $day ); ?>" <?php disabled( ! $open ); ?> data-am="<?php echo esc_attr( (string) $halves['am'] ); ?>" data-pm="<?php echo esc_attr( (string) $halves['pm'] ); ?>" />
										<span><?php echo esc_html( wp_date( 'D', $dt->getTimestamp() ) ); ?><b><?php echo esc_html( $dt->format( 'j' ) ); ?></b></span>
									</label>
								<?php endforeach; ?>
								</div>
								<div class="fw-halves fw-js-only">
									<?php foreach ( array( 'am' => __( 'Morning', 'fernway' ), 'pm' => __( 'Afternoon', 'fernway' ) ) as $h => $word ) : ?>
										<label class="fw-half"><input type="radio" name="fw_half" value="<?php echo esc_attr( $h ); ?>" /><span><?php echo esc_html( $word ); ?><small class="fw-from"></small></span></label>
									<?php endforeach; ?>
								</div>
								<noscript>
									<p class="fw-hint"><?php esc_html_e( 'Or pick an exact time:', 'fernway' ); ?></p>
									<select name="slot">
										<?php foreach ( $days as $day => $halves ) : foreach ( array_filter( $halves ) as $h => $iso ) : ?>
											<option value="<?php echo esc_attr( $iso ); ?>"><?php echo esc_html( wp_date( 'D j M, H:i', strtotime( $iso ) ) ); ?></option>
										<?php endforeach; endforeach; ?>
									</select>
								</noscript>
							<?php endif; ?>
							<?php if ( ! empty( $p['slot'] ) ) : ?><p class="fw-problem" role="alert"><?php echo esc_html( $p['slot'] ); ?></p><?php endif; ?>
						</fieldset>
					<?php elseif ( 'message' === $f ) : ?>
						<label class="fw-field fw-w<?php echo ! empty( $p[ $f ] ) ? ' is-bad' : ''; ?>">
							<span class="fw-label"><?php echo esc_html( $l[ $f ] ); ?></span>
							<span class="fw-box"><?php echo self::icon( 'note' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><textarea name="message" rows="3" maxlength="2000" placeholder="<?php echo esc_attr( $l[ $f ] ); ?>"><?php echo esc_textarea( (string) ( $err['values']['message'] ?? '' ) ); ?></textarea></span>
						</label>
					<?php else : ?>
						<label class="fw-field<?php echo in_array( $f, $wide, true ) && 'full' === $s['variant'] ? ' fw-w' : ''; ?><?php echo ! empty( $p[ $f ] ) ? ' is-bad' : ''; ?>" data-field="<?php echo esc_attr( $f ); ?>">
							<span class="fw-label"><?php echo esc_html( $l[ $f ] ); ?></span>
							<span class="fw-box"><?php echo self::icon( $icons[ $f ] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><input type="<?php echo esc_attr( $types[ $f ] ); ?>" name="<?php echo esc_attr( $f ); ?>" value="<?php echo $val( $f ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>" autocomplete="<?php echo esc_attr( $auto[ $f ] ); ?>" placeholder="<?php echo esc_attr( $l[ $f ] ); ?>" <?php echo 'phone' === $f ? 'inputmode="tel"' : ''; ?> /><?php if ( 'address' === $f && '' !== $area ) : ?><span class="fw-area" aria-live="polite"></span><?php endif; ?></span>
							<?php if ( ! empty( $p[ $f ] ) ) : ?><span class="fw-problem" role="alert"><?php echo esc_html( $p[ $f ] ); ?></span><?php endif; ?>
						</label>
					<?php endif; ?>
				<?php endforeach; ?>
				</div>
				<div class="fw-go">
					<?php if ( '' !== $s['note'] ) : ?><p class="fw-note"><?php echo esc_html( $s['note'] ); ?></p><?php endif; ?>
					<button type="submit" class="fw-send" data-label="<?php echo esc_attr( '' !== $s['submit'] ? $s['submit'] : __( 'Send', 'fernway' ) ); ?>"><span class="fw-send-t"><?php echo esc_html( '' !== $s['submit'] ? $s['submit'] : __( 'Send', 'fernway' ) ); ?></span><?php echo self::icon( 'arrow' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				</div>
			</form>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/** The receipt drawn on the server (no JavaScript); the script takes over and keeps it up to date when it can. */
	public static function receipt_html( array $s, string $id, string $number, string $sig, string $booked, string $first, string $class = '' ): string {
		$lead = Client::call( 'GET', '/api/v1/leads/' . str_replace( ' ', '-', $number ) );
		$data = 200 === $lead['status'] ? (array) ( $lead['json']['lead'] ?? array() ) : array();
		ob_start();
		?>
		<div class="<?php echo esc_attr( trim( 'fernway fw-' . $s['variant'] . ' is-sent ' . $class ) ); ?>" id="fernway-<?php echo esc_attr( $id ); ?>" data-rest="<?php echo esc_url( rest_url( 'fernway/v1/' ) ); ?>" data-number="<?php echo esc_attr( $number ); ?>" data-sig="<?php echo esc_attr( $sig ); ?>" data-booked="<?php echo esc_attr( $booked ); ?>" data-first="<?php echo esc_attr( $first ); ?>">
			<?php echo self::receipt_inner( $number, $sig, $booked, $first, $data ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/** The receipt's inside, also answered by REST so the script can redraw it as the lead moves. */
	public static function receipt_inner( string $number, string $sig, string $booked, string $first, array $lead ): string {
		$tz     = wp_timezone();
		$when   = '' !== $booked ? strtotime( $booked ) : false;
		$half   = $when ? ( (int) wp_date( 'G', $when, $tz ) < 12 ? __( 'morning', 'fernway' ) : __( 'afternoon', 'fernway' ) ) : '';
		/* translators: 1: weekday, 2: morning or afternoon, 3: first name */
		$title  = $when ? ( '' !== $first ? sprintf( __( 'See you %1$s %2$s, %3$s.', 'fernway' ), wp_date( 'l', $when, $tz ), $half, $first ) : sprintf( __( 'See you %1$s %2$s.', 'fernway' ), wp_date( 'l', $when, $tz ), $half ) )
			: ( '' !== $first ? sprintf( /* translators: %s: first name */ __( 'Thanks, %s. It\'s with us.', 'fernway' ), $first ) : __( 'Thanks. It\'s with us.', 'fernway' ) );
		$words  = array(
			'picked_up'       => array( __( 'Picked up', 'fernway' ), __( 'From this page', 'fernway' ) ),
			'checked'         => array( __( 'Checked', 'fernway' ), __( 'Everything needed is there', 'fernway' ) ),
			'handed'          => array( __( 'Handed to our diary', 'fernway' ), __( 'In our system, step by step', 'fernway' ) ),
			'retry_scheduled' => array( __( 'Trying again', 'fernway' ), __( 'Our system was busy; it retries by itself', 'fernway' ) ),
			'signed'          => array( __( 'Signed for', 'fernway' ), __( 'Our office has it. Nothing more for you to do.', 'fernway' ) ),
			'held'            => array( __( 'Held', 'fernway' ), __( 'We\'ll sort it out and be in touch', 'fernway' ) ),
		);
		$scans  = array();
		$seen   = array();
		foreach ( (array) ( $lead['scans'] ?? array() ) as $scan ) {
			$k = (string) ( $scan['kind'] ?? '' );
			if ( ! isset( $words[ $k ] ) || ( isset( $seen[ $k ] ) && 'handed' === $k ) ) {
				continue;
			}
			$seen[ $k ] = true;
			$scans[]    = array( $k, (string) ( $scan['at'] ?? '' ) );
		}
		if ( ! $scans ) {
			$scans[] = array( 'picked_up', gmdate( 'c' ) );
		}
		$state   = (string) ( $lead['state'] ?? 'picked_up' );
		$moving  = ! in_array( $state, array( 'signed', 'held', 'returned' ), true );
		$receipt = (string) get_transient( 'fernway_receipt_' . md5( $number ) );
		ob_start();
		?>
		<div class="fw-sent" data-moving="<?php echo $moving ? '1' : '0'; ?>">
			<div class="fw-sent-top"><span class="fw-tick"><?php echo self::icon( 'tick' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span><div><p class="fw-sent-title" role="status"><?php echo esc_html( $title ); ?></p>
			<?php if ( $when ) : ?><p class="fw-sent-sub"><?php /* translators: 1: date, 2: time */ echo esc_html( sprintf( __( '%1$s, from %2$s', 'fernway' ), wp_date( 'D j M', $when, $tz ), wp_date( get_option( 'time_format', 'H:i' ), $when, $tz ) ) ); ?></p><?php endif; ?></div></div>
			<div class="fw-meta-row"><div><small><?php esc_html_e( 'Receipt', 'fernway' ); ?></small><b class="fw-mono"><?php echo esc_html( $number ); ?></b></div><div><small><?php esc_html_e( 'Now', 'fernway' ); ?></small><b><?php echo esc_html( $moving ? __( 'On its way', 'fernway' ) : ( 'signed' === $state ? __( 'Delivered', 'fernway' ) : __( 'Being looked at', 'fernway' ) ) ); ?></b></div></div>
			<ol class="fw-scans">
				<?php foreach ( $scans as list( $k, $at ) ) : ?>
					<li class="fw-scan fw-scan-<?php echo esc_attr( $k ); ?>"><span class="fw-dot" aria-hidden="true"></span><span><b><?php echo esc_html( $words[ $k ][0] ); ?></b><small><?php echo esc_html( $words[ $k ][1] ); ?></small></span><time class="fw-mono" datetime="<?php echo esc_attr( $at ); ?>"><?php echo esc_html( $at ? wp_date( 'H:i:s', strtotime( $at ), $tz ) : '' ); ?></time></li>
				<?php endforeach; ?>
				<?php if ( $moving ) : ?><li class="fw-scan is-next"><span class="fw-dot" aria-hidden="true"></span><span><b><?php esc_html_e( 'Next step', 'fernway' ); ?></b><small><?php esc_html_e( 'Usually within seconds', 'fernway' ); ?></small></span><time class="fw-mono"><?php esc_html_e( 'now', 'fernway' ); ?></time></li><?php endif; ?>
			</ol>
			<div class="fw-actions">
				<?php if ( '' !== $receipt ) : ?><a class="fw-send fw-copy" href="<?php echo esc_url( $receipt ); ?>" target="_blank" rel="noopener" data-copy="<?php echo esc_url( $receipt ); ?>" data-copy-label="<?php esc_attr_e( 'Copy receipt link', 'fernway' ); ?>"><?php echo self::icon( 'link' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span><?php esc_html_e( 'Open receipt', 'fernway' ); ?></span></a><?php endif; ?>
				<?php if ( $when ) : ?><a class="fw-ghost" href="<?php echo esc_url( add_query_arg( array( 'n' => $number, 't' => $sig ), rest_url( 'fernway/v1/calendar' ) ) ); ?>"><?php echo self::icon( 'calendar' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span><?php esc_html_e( 'Add to my calendar', 'fernway' ); ?></span></a><?php endif; ?>
			</div>
			<p class="fw-by"><?php echo self::icon( 'arrow' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Tracked by Fernway', 'fernway' ); ?><?php if ( '' !== $receipt ) : ?> &middot; <?php esc_html_e( 'opens again at the link for 30 days', 'fernway' ); ?><?php endif; ?></p>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/** Small line glyphs drawn on the same 16px grid, so every field and button leads with one. */
	public static function icon( string $name ): string {
		$d = array(
			'pin'      => '<path d="M8 15s5-5 5-8.5A5 5 0 003 6.5C3 10 8 15 8 15z"/><circle cx="8" cy="6.5" r="1.6" fill="currentColor" stroke="none"/>',
			'person'   => '<circle cx="8" cy="5" r="3"/><path d="M2 14c1-3 3.5-4 6-4s5 1 6 4"/>',
			'phone'    => '<path d="M4 2h3l1 3-2 1a8 8 0 004 4l1-2 3 1v3a1 1 0 01-1 1A11 11 0 013 3a1 1 0 011-1z"/>',
			'mail'     => '<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M2.5 4.5L8 9l5.5-4.5"/>',
			'building' => '<path d="M3 14V3h7v11M10 7h3v7M5.5 6h2M5.5 9h2"/>',
			'note'     => '<path d="M3 3h10v8H7l-4 3z"/>',
			'arrow'    => '<path d="M2 8h10M8 4l4 4-4 4"/>',
			'tick'     => '<path d="M3 8l3 3 7-7"/>',
			'link'     => '<path d="M7 9l2-2M6 5l1-1a3 3 0 014 4l-1 1M10 11l-1 1a3 3 0 01-4-4l1-1"/>',
			'calendar' => '<rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
		);
		return '<svg class="fw-i" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false">' . ( $d[ $name ] ?? '' ) . '</svg>';
	}
}
