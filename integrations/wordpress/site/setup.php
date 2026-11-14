<?php
/**
 * Sets up the Alder & Pike demo site on a fresh WordPress: the theme, the site's name, pretty links, and its pages
 * built from the theme's patterns. Safe to run again: pages are found by their slug and left alone once made, so
 * edits made in WordPress are never overwritten. Run with `wp eval-file setup.php`.
 *
 * @package AlderPike
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( "Run inside WordPress: wp eval-file setup.php\n" );
}

// Pages are written as the site's first administrator would write them, so their charts (inline SVG) are kept.
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'orderby' => 'ID' ) );
if ( ! $admins ) {
	fwrite( STDERR, "no administrator yet: finish the WordPress install first\n" );
	exit( 1 );
}
wp_set_current_user( $admins[0]->ID );

switch_theme( 'alder-pike' );
update_option( 'blogname', 'Alder & Pike' );
update_option( 'blogdescription', 'Roofing · Tacoma, WA' );
update_option( 'timezone_string', 'America/Los_Angeles' );
update_option( 'permalink_structure', '/%postname%/' );
update_option( 'default_comment_status', 'closed' );
update_option( 'blog_public', '0' ); // A demo: kept out of search engines.

// Theme patterns register on init; make sure they are there when this runs from the command line.
if ( function_exists( '_register_theme_block_patterns' ) ) {
	_register_theme_block_patterns();
}

/** The block markup of one or more of the theme's patterns. */
function alder_pike_setup_content( array $slugs ) {
	$registry = WP_Block_Patterns_Registry::get_instance();
	$parts    = array();
	foreach ( $slugs as $slug ) {
		$p = $registry->get_registered( 'alder-pike/' . $slug );
		if ( ! $p ) {
			fwrite( STDERR, "pattern alder-pike/$slug is missing\n" );
			exit( 1 );
		}
		$parts[] = $p['content'];
	}
	return implode( "\n\n", $parts );
}

$privacy = '<!-- wp:group {"align":"full","className":"ap-page","layout":{"type":"constrained"}} --><div class="wp-block-group alignfull ap-page">'
	. '<!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick">Privacy</p><!-- /wp:paragraph -->'
	. '<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">What this demo site keeps</h1><!-- /wp:heading -->'
	. '<!-- wp:paragraph --><p>Alder &amp; Pike is an invented business. This site exists to show Fernway for WordPress, built by Jerome Badour.</p><!-- /wp:paragraph -->'
	. '<!-- wp:paragraph --><p>When you send the roof-check form, what you typed goes to Fernway, which delivers it to a test GoHighLevel account and keeps it for 30 days, then deletes it from both. Nobody will call you about a roof. Fernway\'s own <a href="https://fernway.jeromebadour.com/privacy">privacy page</a> has the details.</p><!-- /wp:paragraph -->'
	. '<!-- wp:paragraph --><p>The site sets no tracking cookies. WordPress keeps the last 50 sends in its own log so the form can be checked, and empties it after 30 days.</p><!-- /wp:paragraph -->'
	. '</div><!-- /wp:group -->';

// Each page: its title, the patterns it is made of, its template, and the line search results and link previews show.
$pages = array(
	'home'       => array( 'Home', array( 'hero', 'how-it-works', 'report-card', 'rain-season', 'work-orders', 'booking' ), '',
		'Alder & Pike Roofing, Tacoma: a free roof check with a report card in 48 hours, every part graded A to F, and a fixed price when work is needed.' ),
	'services'   => array( 'Services', array( 'page-services' ), '',
		'Leak repairs, full replacement, insurance claims, gutters and moss: each job starts from a line on your roof\'s report card, with its price.' ),
	'roof-check' => array( 'Book a free roof check', array( 'page-roof-check' ), 'page-booking',
		'Book a free roof check in Tacoma: pick a morning or an afternoon, and get your roof\'s report card within 48 hours.' ),
	'about'      => array( 'About', array( 'page-about' ), '',
		'Alder & Pike grades its own work too: the company\'s 2025 report card, and the crew behind every roof check.' ),
	'privacy'    => array( 'Privacy', null, '', 'What this demo site keeps when you send its form, and for how long.' ),
);

// The demo follows the repo: a page whose content, template or line has changed in the theme is brought up to date;
// one that already matches is kept, so running this again changes nothing.
foreach ( $pages as $slug => list( $title, $patterns, $template, $excerpt ) ) {
	$post = array(
		'post_type'     => 'page',
		'post_status'   => 'publish',
		'post_name'     => $slug,
		'post_title'    => $title,
		'post_content'  => null === $patterns ? $privacy : alder_pike_setup_content( $patterns ),
		'post_excerpt'  => $excerpt,
		'page_template' => $template,
	);
	$existing = get_page_by_path( $slug, OBJECT, 'page' );
	if ( $existing ) {
		$ids[ $slug ] = $existing->ID;
		$same = $existing->post_content === $post['post_content'] && $existing->post_excerpt === $excerpt
			&& (string) get_page_template_slug( $existing->ID ) === $template;
		if ( $same ) {
			echo "page $slug: kept (id {$existing->ID})\n";
			continue;
		}
		$post['ID'] = $existing->ID;
		$id         = wp_update_post( $post, true );
		$verb       = 'updated';
	} else {
		$id   = wp_insert_post( $post, true );
		$verb = 'made';
	}
	if ( is_wp_error( $id ) ) {
		fwrite( STDERR, "page $slug: " . $id->get_error_message() . "\n" );
		exit( 1 );
	}
	$ids[ $slug ] = $id;
	echo "page $slug: $verb (id $id)\n";
}

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $ids['home'] );
update_option( 'wp_page_for_privacy_policy', $ids['privacy'] );
flush_rewrite_rules( false );
echo "site ready\n";
