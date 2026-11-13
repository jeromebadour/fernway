<?php
/**
 * Settings, Fernway: the key, the default route, how phone numbers and addresses are read, a connection test, and
 * the log of recent sends.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Settings {

	const PAGE = 'fernway';

	public static function boot(): void {
		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'admin_init', array( self::class, 'register' ) );
		add_action( 'admin_post_fernway_test', array( self::class, 'test' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( FERNWAY_FILE ), array( self::class, 'link' ) );
	}

	public static function link( array $links ): array {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Settings', 'fernway' ) . '</a>' );
		return $links;
	}

	public static function menu(): void {
		add_options_page( __( 'Fernway', 'fernway' ), __( 'Fernway', 'fernway' ), 'manage_options', self::PAGE, array( self::class, 'page' ) );
	}

	public static function assets( string $hook ): void {
		if ( 'settings_page_' . self::PAGE === $hook ) {
			wp_enqueue_style( 'fernway-admin', FERNWAY_URL . 'assets/admin.css', array(), FERNWAY_VERSION );
		}
	}

	public static function register(): void {
		register_setting( 'fernway', 'fernway_url', array( 'type' => 'string', 'sanitize_callback' => array( self::class, 'clean_url' ), 'default' => Client::DEFAULT_URL ) );
		register_setting( 'fernway', 'fernway_api_key', array( 'type' => 'string', 'sanitize_callback' => array( self::class, 'clean_key' ), 'default' => '' ) );
		register_setting( 'fernway', 'fernway_route', array( 'type' => 'string', 'sanitize_callback' => array( self::class, 'clean_route' ), 'default' => '' ) );
		register_setting( 'fernway', 'fernway_country', array( 'type' => 'string', 'sanitize_callback' => array( self::class, 'clean_country' ), 'default' => 'US' ) );
		register_setting( 'fernway', 'fernway_area', array( 'type' => 'string', 'sanitize_callback' => array( self::class, 'clean_area' ), 'default' => '' ) );
	}

	/** https only; plain http only for a Fernway on this same machine (a developer's own copy). */
	public static function clean_url( $v ): string {
		$v     = trim( (string) $v );
		$local = in_array( (string) wp_parse_url( $v, PHP_URL_HOST ), array( '127.0.0.1', 'localhost' ), true );
		$v     = esc_url_raw( $v, $local ? array( 'http', 'https' ) : array( 'https' ) );
		return '' !== $v ? untrailingslashit( $v ) : Client::DEFAULT_URL;
	}

	/** An empty box keeps the key already saved; only a new, well-formed key replaces it. */
	public static function clean_key( $v ): string {
		$v   = trim( (string) $v );
		$old = (string) get_option( 'fernway_api_key', '' );
		if ( '' === $v ) {
			return $old;
		}
		if ( ! preg_match( '/^fw_[a-z0-9]{8}_[a-z0-9]{32}$/', $v ) ) {
			add_settings_error( 'fernway_api_key', 'key', __( 'That isn\'t a Fernway key: it starts fw_ and has two parts. The saved key was kept.', 'fernway' ) );
			return $old;
		}
		return $v;
	}

	public static function clean_route( $v ): string {
		$v = strtolower( trim( (string) $v ) );
		return preg_match( '/^[a-z0-9-]{1,40}$/', $v ) ? $v : '';
	}

	public static function clean_country( $v ): string {
		$v = strtoupper( trim( (string) $v ) );
		return preg_match( '/^[A-Z]{2}$/', $v ) ? $v : 'US';
	}

	/** ZIP codes or their starts, one list: "984, 98335". */
	public static function clean_area( $v ): string {
		preg_match_all( '/[0-9]{3,5}/', (string) $v, $m );
		return implode( ', ', array_unique( $m[0] ) );
	}

	/** The connection test: is the key live, and what is the default route? Result shown once on the page. */
	public static function test(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Only an administrator can test the connection.', 'fernway' ), 403 );
		}
		check_admin_referer( 'fernway_test' );
		$lines = array();
		// A waybill no account has: 404 means the key was accepted, 401 that it wasn't.
		$k = Client::call( 'GET', '/api/v1/leads/FW-00-00000' );
		if ( 404 === $k['status'] ) {
			$lines[] = array( 'ok', __( 'Key accepted by Fernway.', 'fernway' ) );
		} elseif ( 401 === $k['status'] ) {
			$lines[] = array( 'bad', __( 'Fernway refused the key. Make a new one in the Fernway console, under API keys.', 'fernway' ) );
		} else {
			$lines[] = array( 'bad', Client::problem( $k ) );
		}
		$route = (string) get_option( 'fernway_route', '' );
		if ( 'ok' === $lines[0][0] && '' !== $route ) {
			$s = Client::call( 'GET', '/api/v1/routes/' . rawurlencode( $route ) . '/slots' );
			if ( 200 === $s['status'] ) {
				/* translators: 1: route key, 2: number of free times */
				$lines[] = array( 'ok', sprintf( __( 'Route %1$s books meetings: %2$d free times in the next 14 days.', 'fernway' ), $route, count( $s['json']['slots'] ?? array() ) ) );
			} elseif ( 422 === $s['status'] ) {
				/* translators: %s: route key */
				$lines[] = array( 'ok', sprintf( __( 'Route %s is there; it books no meetings, so forms on it ask no time.', 'fernway' ), $route ) );
			} elseif ( 404 === $s['status'] ) {
				/* translators: %s: route key */
				$lines[] = array( 'bad', sprintf( __( 'Fernway has no route called %s on this key\'s account.', 'fernway' ), $route ) );
			} else {
				$lines[] = array( 'bad', Client::problem( $s ) );
			}
		}
		set_transient( 'fernway_test_' . get_current_user_id(), $lines, 120 );
		wp_safe_redirect( admin_url( 'options-general.php?page=' . self::PAGE . '&tested=1' ) );
		exit;
	}

	public static function page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$key    = (string) get_option( 'fernway_api_key', '' );
		$tested = isset( $_GET['tested'] ) ? get_transient( 'fernway_test_' . get_current_user_id() ) : false; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $tested ) {
			delete_transient( 'fernway_test_' . get_current_user_id() );
		}
		?>
		<div class="wrap fw-admin">
			<h1><span class="dashicons dashicons-randomize" aria-hidden="true"></span><?php esc_html_e( 'Fernway', 'fernway' ); ?></h1>
			<p class="fw-lede"><?php esc_html_e( 'Forms on this site send their leads to Fernway, which delivers them into GoHighLevel and gives each one a waybill and a receipt.', 'fernway' ); ?></p>
			<?php settings_errors(); ?>

			<?php if ( $tested ) : ?>
				<div class="fw-test" role="status">
					<?php foreach ( $tested as list( $kind, $text ) ) : ?>
						<p class="fw-test-<?php echo esc_attr( $kind ); ?>"><span class="dashicons dashicons-<?php echo 'ok' === $kind ? 'yes-alt' : 'warning'; ?>" aria-hidden="true"></span><?php echo esc_html( $text ); ?></p>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>

			<div class="fw-grid">
				<form method="post" action="options.php" class="fw-card">
					<h2><span class="dashicons dashicons-admin-network" aria-hidden="true"></span><?php esc_html_e( 'Connection', 'fernway' ); ?></h2>
					<?php settings_fields( 'fernway' ); ?>
					<p class="fw-field">
						<label for="fernway_api_key"><?php esc_html_e( 'API key', 'fernway' ); ?></label>
						<input type="password" id="fernway_api_key" name="fernway_api_key" autocomplete="off" spellcheck="false" placeholder="<?php echo $key ? esc_attr( substr( $key, 0, 12 ) . '…' ) : 'fw_xxxxxxxx_…'; ?>" />
						<span class="fw-hint"><?php echo $key ? esc_html__( 'A key is saved. Leave this empty to keep it; paste a new one to replace it.', 'fernway' ) : esc_html__( 'Make one in the Fernway console, under API keys. It stays on this server.', 'fernway' ); ?></span>
					</p>
					<p class="fw-field">
						<label for="fernway_route"><?php esc_html_e( 'Default route', 'fernway' ); ?></label>
						<input type="text" id="fernway_route" name="fernway_route" value="<?php echo esc_attr( (string) get_option( 'fernway_route', '' ) ); ?>" placeholder="roof-check" pattern="[a-z0-9-]{1,40}" />
						<span class="fw-hint"><?php esc_html_e( 'Where a form\'s leads go in GoHighLevel, unless the form names its own route.', 'fernway' ); ?></span>
					</p>
					<p class="fw-field fw-pair">
						<span>
							<label for="fernway_country"><?php esc_html_e( 'Country', 'fernway' ); ?></label>
							<input type="text" id="fernway_country" name="fernway_country" value="<?php echo esc_attr( (string) get_option( 'fernway_country', 'US' ) ); ?>" maxlength="2" class="fw-short" />
						</span>
						<span class="fw-hint"><?php esc_html_e( 'Two letters. Phone numbers without a country code, and addresses, are read as this country\'s.', 'fernway' ); ?></span>
					</p>
					<p class="fw-field">
						<label for="fernway_area"><?php esc_html_e( 'Service area (optional)', 'fernway' ); ?></label>
						<input type="text" id="fernway_area" name="fernway_area" value="<?php echo esc_attr( (string) get_option( 'fernway_area', '' ) ); ?>" placeholder="983, 984" />
						<span class="fw-hint"><?php esc_html_e( 'ZIP codes or their first digits. An address outside them is still sent; the form tells the visitor you\'ll confirm.', 'fernway' ); ?></span>
					</p>
					<details class="fw-more">
						<summary><?php esc_html_e( 'Fernway address', 'fernway' ); ?></summary>
						<p class="fw-field"><input type="url" name="fernway_url" value="<?php echo esc_attr( Client::base() ); ?>" /></p>
					</details>
					<p class="fw-actions"><button type="submit" class="button button-primary"><span class="dashicons dashicons-saved" aria-hidden="true"></span><?php esc_html_e( 'Save', 'fernway' ); ?></button></p>
				</form>

				<div class="fw-card">
					<h2><span class="dashicons dashicons-yes-alt" aria-hidden="true"></span><?php esc_html_e( 'Test', 'fernway' ); ?></h2>
					<p><?php esc_html_e( 'Checks the saved key with Fernway, and what the default route does. Nothing is sent to GoHighLevel.', 'fernway' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="fernway_test" />
						<?php wp_nonce_field( 'fernway_test' ); ?>
						<button type="submit" class="button" <?php disabled( '' === $key ); ?>><span class="dashicons dashicons-update" aria-hidden="true"></span><?php esc_html_e( 'Test connection', 'fernway' ); ?></button>
					</form>
					<h2 class="fw-sub"><span class="dashicons dashicons-block-default" aria-hidden="true"></span><?php esc_html_e( 'Adding a form', 'fernway' ); ?></h2>
					<p><?php echo wp_kses_post( __( 'In the editor, add the <strong>Fernway form</strong> block and pick its fields. With Elementor, drag in the <strong>Fernway form</strong> widget.', 'fernway' ) ); ?></p>
				</div>
			</div>

			<?php self::log_table(); ?>
		</div>
		<?php
	}

	private static function log_table(): void {
		$entries = Log::all();
		$words   = array(
			'sent'        => __( 'Sent', 'fernway' ),
			'duplicate'   => __( 'Sent before', 'fernway' ),
			'refused'     => __( 'Refused', 'fernway' ),
			'taken'       => __( 'Time taken', 'fernway' ),
			'limited'     => __( 'Too many', 'fernway' ),
			'unreachable' => __( 'Not reached', 'fernway' ),
		);
		$tz = wp_timezone();
		?>
		<div class="fw-card fw-log">
			<h2><span class="dashicons dashicons-list-view" aria-hidden="true"></span><?php esc_html_e( 'Recent sends', 'fernway' ); ?></h2>
			<p class="fw-hint"><?php esc_html_e( 'The last 50, kept 30 days. What visitors typed is never kept here: open a waybill in the Fernway console to see the lead.', 'fernway' ); ?></p>
			<?php if ( ! $entries ) : ?>
				<p class="fw-empty"><?php esc_html_e( 'No sends yet. A form\'s first lead appears here.', 'fernway' ); ?></p>
			<?php else : ?>
				<table class="widefat striped">
					<thead><tr><th class="fw-num">#</th><th><?php esc_html_e( 'When', 'fernway' ); ?></th><th><?php esc_html_e( 'Route', 'fernway' ); ?></th><th><?php esc_html_e( 'Outcome', 'fernway' ); ?></th><th><?php esc_html_e( 'Waybill', 'fernway' ); ?></th><th><?php esc_html_e( 'Fernway said', 'fernway' ); ?></th></tr></thead>
					<tbody>
					<?php foreach ( $entries as $i => $e ) : ?>
						<tr>
							<td class="fw-num"><?php echo (int) $i + 1; ?></td>
							<td class="fw-mono"><?php echo esc_html( wp_date( 'j M, H:i', (int) $e['at'], $tz ) ); ?></td>
							<td class="fw-mono"><?php echo esc_html( (string) $e['route'] ); ?></td>
							<td><span class="fw-out fw-out-<?php echo esc_attr( (string) $e['outcome'] ); ?>"><?php echo esc_html( $words[ $e['outcome'] ] ?? (string) $e['outcome'] ); ?></span></td>
							<td class="fw-mono"><?php echo '' !== $e['number'] ? esc_html( (string) $e['number'] ) : '&ndash;'; ?></td>
							<td><?php echo esc_html( '' !== $e['problem'] ? (string) $e['problem'] : ( $e['status'] ? (string) $e['status'] : '' ) ); ?></td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<?php
	}
}
