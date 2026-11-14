<?php
/**
 * Title: Hero with the sample report card
 * Slug: alder-pike/hero
 * Categories: alder-pike, banner
 * Description: The headline, the storm countdown, and a sample report card with the quick booking form.
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"align":"full","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull">
<!-- wp:columns {"align":"wide","className":"ap-hero"} -->
<div class="wp-block-columns alignwide ap-hero">
	<!-- wp:column -->
	<div class="wp-block-column">
		<!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'Puget Sound roofs, since 2009', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
		<!-- wp:heading {"level":1} -->
		<h1 class="wp-block-heading"><?php echo wp_kses_post( __( 'Know what your roof <mark>looks like</mark> before the rain does.', 'alder-pike' ) ); ?></h1>
		<!-- /wp:heading -->
		<!-- wp:paragraph {"className":"ap-lede"} --><p class="ap-lede"><?php esc_html_e( 'A 45-minute check from the ladder, not a sales visit. You get a graded report with photos of every problem, and a price only if something needs doing.', 'alder-pike' ); ?></p><!-- /wp:paragraph -->

		<!-- wp:group {"className":"ap-storm","layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"bottom"}} -->
		<div class="wp-block-group ap-storm">
			<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"alder-pike/storm-season","args":{"part":"number"}}}},"className":"ap-days"} --><p class="ap-days">23</p><!-- /wp:paragraph -->
			<!-- wp:group {"layout":{"type":"default"}} -->
			<div class="wp-block-group">
				<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"alder-pike/storm-season","args":{"part":"label"}}}},"className":"ap-days-label"} --><p class="ap-days-label"><?php esc_html_e( 'Days until storm season', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
				<!-- wp:paragraph {"className":"ap-storm-note"} --><p class="ap-storm-note"><?php esc_html_e( 'Tacoma averages 6.5 in of rain in November. Last fall we fixed 214 leaks; 160 started at the flashing.', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
				<!-- wp:html -->
				<figure class="ap-chart" aria-hidden="true" title="Tacoma rain, April to December (NOAA normals)"><svg viewBox="0 0 360 40" preserveAspectRatio="none" width="100%" height="40"><g fill="#3c454b"><rect x="0" y="32" width="36" height="8"/><rect x="40" y="34" width="36" height="6"/><rect x="80" y="35" width="36" height="5"/><rect x="120" y="33" width="36" height="7"/><rect x="160" y="28" width="36" height="12"/><rect x="200" y="18" width="36" height="22"/></g><g fill="#86aecd"><rect x="240" y="3" width="36" height="37"/><rect x="280" y="0" width="36" height="40"/><rect x="320" y="5" width="36" height="35"/></g></svg></figure>
				<!-- /wp:html -->
			</div>
			<!-- /wp:group -->
		</div>
		<!-- /wp:group -->
	</div>
	<!-- /wp:column -->

	<!-- wp:column {"width":"620px"} -->
	<div class="wp-block-column" style="flex-basis:620px">
		<!-- wp:group {"className":"ap-card","layout":{"type":"default"}} -->
		<div class="wp-block-group ap-card">
			<!-- wp:group {"className":"ap-card-head","layout":{"type":"flex","justifyContent":"space-between"}} -->
			<div class="wp-block-group ap-card-head">
				<!-- wp:paragraph --><p><?php esc_html_e( 'Sample report card', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
				<!-- wp:paragraph {"className":"ap-card-meta"} --><p class="ap-card-meta"><?php esc_html_e( '14 Cedar Ln · Oct 30', 'alder-pike' ); ?></p><!-- /wp:paragraph -->
			</div>
			<!-- /wp:group -->
			<!-- wp:group {"className":"ap-roof","layout":{"type":"default"}} -->
			<div class="wp-block-group ap-roof">
				<!-- wp:image {"sizeSlug":"full"} -->
				<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/roof.svg' ) ); ?>" alt="<?php esc_attr_e( 'Drawing of a pitched roof with a chimney and a gutter, graded part by part', 'alder-pike' ); ?>"/></figure>
				<!-- /wp:image -->
				<!-- wp:group {"className":"ap-tag","layout":{"type":"flex","flexWrap":"nowrap"}} -->
				<div class="wp-block-group ap-tag"><!-- wp:paragraph {"className":"ap-grade ap-grade-d"} --><p class="ap-grade ap-grade-d">D</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><?php esc_html_e( 'Chimney flashing', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
				<!-- /wp:group -->
				<!-- wp:group {"className":"ap-tag","layout":{"type":"flex","flexWrap":"nowrap"}} -->
				<div class="wp-block-group ap-tag"><!-- wp:paragraph {"className":"ap-grade"} --><p class="ap-grade">A</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><?php esc_html_e( 'Shingles, 9 yrs left', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
				<!-- /wp:group -->
				<!-- wp:group {"className":"ap-tag","layout":{"type":"flex","flexWrap":"nowrap"}} -->
				<div class="wp-block-group ap-tag"><!-- wp:paragraph {"className":"ap-grade ap-grade-c"} --><p class="ap-grade ap-grade-c">C</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><?php esc_html_e( 'Gutter pulling away', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
				<!-- /wp:group -->
				<!-- wp:group {"className":"ap-tag","layout":{"type":"flex","flexWrap":"nowrap"}} -->
				<div class="wp-block-group ap-tag"><!-- wp:paragraph {"className":"ap-grade"} --><p class="ap-grade">B</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><?php esc_html_e( 'Vents and boots', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
				<!-- /wp:group -->
				<!-- wp:group {"className":"ap-legend","layout":{"type":"flex","flexWrap":"wrap"}} -->
				<div class="wp-block-group ap-legend"><!-- wp:paragraph {"className":"ap-legend-good"} --><p class="ap-legend-good"><?php esc_html_e( 'A to B sound', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-legend-watch"} --><p class="ap-legend-watch"><?php esc_html_e( 'C watch it', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-legend-bad"} --><p class="ap-legend-bad"><?php esc_html_e( 'D to F fix before rain', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
				<!-- /wp:group -->
			</div>
			<!-- /wp:group -->
			<!-- wp:group {"className":"ap-card-body","layout":{"type":"default"}} -->
			<div class="wp-block-group ap-card-body">
				<!-- wp:fernway/form {"route":"callback","fields":["address","phone"],"submitLabel":"Call me back","note":"We call within a working day to fix the time","variant":"compact","labels":{"address":"House address"}} /-->
			</div>
			<!-- /wp:group -->
		</div>
		<!-- /wp:group -->
	</div>
	<!-- /wp:column -->
</div>
<!-- /wp:columns -->
</div>
<!-- /wp:group -->
