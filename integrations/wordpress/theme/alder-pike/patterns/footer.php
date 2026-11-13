<?php
/**
 * Title: Footer
 * Slug: alder-pike/footer
 * Categories: footer
 * Block Types: core/template-part/footer
 * Inserter: no
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"tagName":"footer","align":"full","className":"ap-footer","layout":{"type":"constrained"}} -->
<footer class="wp-block-group alignfull ap-footer">
	<!-- wp:columns {"align":"wide"} -->
	<div class="wp-block-columns alignwide">
		<!-- wp:column {"width":"36%"} -->
		<div class="wp-block-column" style="flex-basis:36%">
			<!-- wp:group {"className":"ap-mark","layout":{"type":"flex","flexWrap":"nowrap"}} -->
			<div class="wp-block-group ap-mark">
				<!-- wp:image {"width":"30px","height":"30px","sizeSlug":"full"} -->
				<figure class="wp-block-image size-full is-resized"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/logo.svg' ) ); ?>" alt="" style="width:30px;height:30px"/></figure>
				<!-- /wp:image -->
				<!-- wp:site-title {"level":0,"isLink":false} /-->
			</div>
			<!-- /wp:group -->
			<!-- wp:paragraph -->
			<p><?php esc_html_e( 'Roof checks, repairs and replacement across Tacoma, Puyallup and Gig Harbor.', 'alder-pike' ); ?></p>
			<!-- /wp:paragraph -->
		</div>
		<!-- /wp:column -->
		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:heading {"level":2} --><h2 class="wp-block-heading"><?php esc_html_e( 'Visit', 'alder-pike' ); ?></h2><!-- /wp:heading -->
			<!-- wp:list -->
			<ul class="wp-block-list"><li><?php esc_html_e( '2210 S Tacoma Way', 'alder-pike' ); ?></li><li><?php esc_html_e( 'Mon to Sat, 7 to 6', 'alder-pike' ); ?></li><li><?php esc_html_e( 'Leaks: 7 days', 'alder-pike' ); ?></li></ul>
			<!-- /wp:list -->
		</div>
		<!-- /wp:column -->
		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:heading {"level":2} --><h2 class="wp-block-heading"><?php esc_html_e( 'Work', 'alder-pike' ); ?></h2><!-- /wp:heading -->
			<!-- wp:list -->
			<ul class="wp-block-list"><li><a href="/roof-check/"><?php esc_html_e( 'Roof checks', 'alder-pike' ); ?></a></li><li><a href="/services/#repairs"><?php esc_html_e( 'Repairs', 'alder-pike' ); ?></a></li><li><a href="/services/#replacement"><?php esc_html_e( 'Replacement', 'alder-pike' ); ?></a></li><li><a href="/services/#claims"><?php esc_html_e( 'Insurance claims', 'alder-pike' ); ?></a></li></ul>
			<!-- /wp:list -->
		</div>
		<!-- /wp:column -->
		<!-- wp:column -->
		<div class="wp-block-column">
			<!-- wp:heading {"level":2} --><h2 class="wp-block-heading"><?php esc_html_e( 'This site', 'alder-pike' ); ?></h2><!-- /wp:heading -->
			<!-- wp:list -->
			<ul class="wp-block-list"><li><a href="https://fernway.jeromebadour.com/docs/wordpress"><?php esc_html_e( 'A Fernway demo', 'alder-pike' ); ?></a></li><li><a href="/privacy/"><?php esc_html_e( 'Privacy', 'alder-pike' ); ?></a></li><li><a href="https://jeromebadour.com"><?php esc_html_e( 'Built by Jerome Badour', 'alder-pike' ); ?></a></li></ul>
			<!-- /wp:list -->
		</div>
		<!-- /wp:column -->
	</div>
	<!-- /wp:columns -->

	<!-- wp:group {"align":"wide","className":"ap-footbar","layout":{"type":"flex","justifyContent":"space-between"}} -->
	<div class="wp-block-group alignwide ap-footbar">
		<!-- wp:paragraph --><p><strong><?php esc_html_e( 'Licensed &amp; bonded', 'alder-pike' ); ?></strong> <?php esc_html_e( 'in Washington (invented)', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
		<!-- wp:paragraph --><p><strong><?php esc_html_e( '10-year', 'alder-pike' ); ?></strong> <?php esc_html_e( 'workmanship warranty', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
		<!-- wp:paragraph --><p><?php esc_html_e( 'Forms delivered by', 'alder-pike' ); ?> <strong>Fernway</strong></p><!-- /wp:paragraph -->
	</div>
	<!-- /wp:group -->
</footer>
<!-- /wp:group -->

<!-- wp:buttons {"className":"ap-pinned"} -->
<div class="wp-block-buttons ap-pinned">
	<!-- wp:button -->
	<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/roof-check/"><?php esc_html_e( 'Book a free roof check', 'alder-pike' ); ?></a></div>
	<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
