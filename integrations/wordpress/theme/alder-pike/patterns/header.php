<?php
/**
 * Title: Header
 * Slug: alder-pike/header
 * Categories: header
 * Block Types: core/template-part/header
 * Inserter: no
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"align":"full","className":"ap-header","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull ap-header">
<!-- wp:group {"align":"full","className":"ap-demo","layout":{"type":"default"}} -->
<div class="wp-block-group alignfull ap-demo"><!-- wp:paragraph -->
<p><strong><?php esc_html_e( 'Demo site.', 'alder-pike' ); ?></strong> <?php echo wp_kses_post( __( 'Alder &amp; Pike Roofing is an invented business, built by Jerome Badour to show <a href="https://fernway.jeromebadour.com/docs/wordpress">Fernway for WordPress</a>. Its form sends real leads into a test CRM.', 'alder-pike' ) ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"ap-stripe","layout":{"type":"default"}} -->
<div class="wp-block-group alignfull ap-stripe"></div>
<!-- /wp:group -->

<!-- wp:group {"align":"wide","className":"ap-bar","layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"}} -->
<div class="wp-block-group alignwide ap-bar">
	<!-- wp:group {"className":"ap-mark","layout":{"type":"flex","flexWrap":"nowrap"}} -->
	<div class="wp-block-group ap-mark">
		<!-- wp:image {"width":"36px","height":"36px","sizeSlug":"full","linkDestination":"custom","className":"ap-logo"} -->
		<figure class="wp-block-image size-full is-resized ap-logo"><a href="<?php echo esc_url( home_url( '/' ) ); ?>"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/logo.svg' ) ); ?>" alt="<?php esc_attr_e( 'Alder & Pike, home', 'alder-pike' ); ?>" style="width:36px;height:36px"/></a></figure>
		<!-- /wp:image -->
		<!-- wp:group {"layout":{"type":"default"}} -->
		<div class="wp-block-group">
			<!-- wp:site-title {"level":0} /-->
			<!-- wp:site-tagline /-->
		</div>
		<!-- /wp:group -->
	</div>
	<!-- /wp:group -->

	<!-- wp:navigation {"overlayMenu":"mobile","hasIcon":false,"layout":{"type":"flex","justifyContent":"right"},"ariaLabel":"<?php esc_attr_e( 'Main', 'alder-pike' ); ?>"} -->
		<!-- wp:navigation-link {"label":"<?php esc_attr_e( 'Roof checks', 'alder-pike' ); ?>","url":"/roof-check/","kind":"custom"} /-->
		<!-- wp:navigation-link {"label":"<?php esc_attr_e( 'Repairs', 'alder-pike' ); ?>","url":"/services/#repairs","kind":"custom"} /-->
		<!-- wp:navigation-link {"label":"<?php esc_attr_e( 'Replacement', 'alder-pike' ); ?>","url":"/services/#replacement","kind":"custom"} /-->
		<!-- wp:navigation-link {"label":"<?php esc_attr_e( 'Insurance claims', 'alder-pike' ); ?>","url":"/services/#claims","kind":"custom"} /-->
		<!-- wp:navigation-link {"label":"<?php esc_attr_e( 'About', 'alder-pike' ); ?>","url":"/about/","kind":"custom"} /-->
	<!-- /wp:navigation -->

	<!-- wp:buttons {"className":"ap-bar-book"} -->
	<div class="wp-block-buttons ap-bar-book">
		<!-- wp:button -->
		<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/roof-check/"><?php esc_html_e( 'Book a free roof check', 'alder-pike' ); ?></a></div>
		<!-- /wp:button -->
	</div>
	<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
