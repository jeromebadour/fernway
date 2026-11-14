<?php
/**
 * Alder & Pike: a block theme made from scratch for an invented Tacoma roofer, the demo site for Fernway for
 * WordPress. Words and pictures are edited in the Site Editor; the look lives in theme.json and style.css.
 *
 * @package AlderPike
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ALDER_PIKE_VERSION', '1.0.0' );

/** The same stylesheet on the site and inside the editor, so what the owner edits is what visitors see. */
add_action(
	'after_setup_theme',
	static function () {
		add_theme_support( 'editor-styles' );
		add_editor_style( 'style.css' );
		// A page's excerpt is its description: editable in the page's sidebar, printed below as the meta description.
		add_post_type_support( 'page', 'excerpt' );
	}
);

/**
 * The four faces every page shows at first paint, asked for before the stylesheet names them, so the text is drawn in
 * them from the start instead of swapping in and moving the page (Lighthouse measured the footer shifting on short
 * pages). The other weights stay on demand.
 */
add_action(
	'wp_head',
	static function () {
		foreach ( array( 'archivo-latin-400-normal', 'archivo-latin-700-normal', 'ibm-plex-mono-latin-400-normal', 'ibm-plex-mono-latin-500-normal' ) as $face ) {
			echo '<link rel="preload" href="' . esc_url( get_theme_file_uri( "assets/fonts/$face.woff2" ) ) . '" as="font" type="font/woff2" crossorigin />' . "\n";
		}
	},
	1
);

/** The line search results and link previews show: the page's own excerpt, when it has one. */
add_action(
	'wp_head',
	static function () {
		if ( is_singular() && has_excerpt() ) {
			echo '<meta name="description" content="' . esc_attr( wp_strip_all_tags( get_the_excerpt() ) ) . '" />' . "\n";
		}
	},
	1
);

add_action(
	'wp_enqueue_scripts',
	static function () {
		wp_enqueue_style( 'alder-pike', get_stylesheet_uri(), array(), ALDER_PIKE_VERSION );
	}
);

add_action(
	'init',
	static function () {
		register_block_pattern_category( 'alder-pike', array( 'label' => __( 'Alder & Pike', 'alder-pike' ) ) );

		/*
		 * Days until storm season, worked out on every visit rather than typed in, so the number never goes stale.
		 * Tacoma's wet season runs October to February; inside it the line says so instead of counting.
		 */
		register_block_bindings_source(
			'alder-pike/storm-season',
			array(
				'label'              => __( 'Storm season countdown', 'alder-pike' ),
				'get_value_callback' => 'alder_pike_storm_season',
			)
		);
	}
);

/**
 * The countdown's parts: `number` (days, or "Now"), `label` (what the number means) and `note` (what to do about it).
 *
 * @param array $args Binding arguments; `part` is `number`, `label` or `note`.
 * @return string
 */
function alder_pike_storm_season( array $args ) {
	$tz    = wp_timezone();
	$today = new DateTimeImmutable( 'today', $tz );
	$month = (int) $today->format( 'n' );
	$part = $args['part'] ?? '';
	if ( $month >= 10 || $month <= 2 ) {
		if ( 'note' === $part ) {
			return __( 'Leaks get a crew within a day. Roof checks still go ahead between fronts, so the dry days fill first.', 'alder-pike' );
		}
		return 'number' === $part ? __( 'Now', 'alder-pike' ) : __( 'Storm season is here', 'alder-pike' );
	}
	if ( 'note' === $part ) {
		return __( 'Checks booked in the next three weeks get done before the first big front. After that, our crew\'s diary fills with leaks.', 'alder-pike' );
	}
	$start = new DateTimeImmutable( $today->format( 'Y' ) . '-10-01', $tz );
	$days  = (int) $today->diff( $start )->days;
	if ( 'number' === $part ) {
		return (string) $days;
	}
	/* translators: shown under the number of days left */
	return 1 === $days ? __( 'Day until storm season', 'alder-pike' ) : __( 'Days until storm season', 'alder-pike' );
}

/** Booking pages carry their own form, so the pinned "book" button on phones would only cover it. */
add_filter(
	'body_class',
	static function ( array $classes ) {
		if ( is_page() && 'page-booking' === get_page_template_slug() ) {
			$classes[] = 'ap-booking';
		}
		return $classes;
	}
);
