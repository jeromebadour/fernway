<?php
/**
 * Title: Why now: rain by month
 * Slug: alder-pike/rain-season
 * Categories: alder-pike
 * Description: Tacoma's rain by month with the storm-season countdown.
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"align":"full","className":"ap-band","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull ap-band">
<!-- wp:group {"align":"wide","layout":{"type":"default"}} -->
<div class="wp-block-group alignwide"><!-- wp:columns {"align":"wide","className":"ap-season","verticalAlignment":"bottom"} --><div class="wp-block-columns alignwide are-vertically-aligned-bottom ap-season"><!-- wp:column {"verticalAlignment":"bottom"} --><div class="wp-block-column is-vertically-aligned-bottom"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'Why now', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading"><?php echo wp_kses_post( __( 'Tacoma\'s rain <mark>arrives in October</mark>', 'alder-pike' ) ); ?></h2><!-- /wp:heading --><!-- wp:html -->
<figure class="ap-chart" role="img" aria-label="Average rain in Tacoma by month: wettest from October to February, driest in July."><svg viewBox="0 0 900 236"><rect x="7" y="76" width="61" height="124" fill="#86aecd"/><rect x="82" y="104" width="61" height="96" fill="#86aecd"/><rect x="157" y="112" width="61" height="88" fill="#3c454b"/><rect x="232" y="132" width="61" height="68" fill="#3c454b"/><rect x="307" y="148" width="61" height="52" fill="#3c454b"/><rect x="382" y="164" width="61" height="36" fill="#3c454b"/><rect x="457" y="182" width="61" height="18" fill="#3c454b"/><rect x="532" y="176" width="61" height="24" fill="#3c454b"/><rect x="607" y="156" width="61" height="44" fill="#3c454b"/><rect x="682" y="84" width="61" height="116" fill="#86aecd"/><rect x="757" y="0" width="61" height="200" fill="#86aecd"/><rect x="832" y="16" width="61" height="184" fill="#86aecd"/><rect x="678" y="78" width="75" height="124" fill="none" stroke="#ee6a1f" stroke-width="2.5"/><path d="M0 201h900" stroke="#3c454b" stroke-width="2"/><g fill="#8d958f" font-family="IBM Plex Mono, monospace" font-size="13"><text x="37" y="226" text-anchor="middle">Jan</text><text x="112" y="226" text-anchor="middle">Feb</text><text x="187" y="226" text-anchor="middle">Mar</text><text x="262" y="226" text-anchor="middle">Apr</text><text x="337" y="226" text-anchor="middle">May</text><text x="412" y="226" text-anchor="middle">Jun</text><text x="487" y="226" text-anchor="middle">Jul</text><text x="562" y="226" text-anchor="middle">Aug</text><text x="637" y="226" text-anchor="middle">Sep</text><text x="712" y="226" text-anchor="middle">Oct</text><text x="787" y="226" text-anchor="middle">Nov</text><text x="862" y="226" text-anchor="middle">Dec</text></g></svg></figure>
<!-- /wp:html --></div><!-- /wp:column --><!-- wp:column {"verticalAlignment":"bottom","width":"360px"} --><div class="wp-block-column is-vertically-aligned-bottom" style="flex-basis:360px"><!-- wp:group {"className":"ap-count","layout":{"type":"default"}} -->
<div class="wp-block-group ap-count"><!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"alder-pike/storm-season","args":{"part":"number"}}}},"className":"ap-days"} --><p class="ap-days">23</p><!-- /wp:paragraph --><!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"alder-pike/storm-season","args":{"part":"label"}}}},"className":"ap-kick"} --><p class="ap-kick">days until storm season</p><!-- /wp:paragraph --><!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"alder-pike/storm-season","args":{"part":"note"}}}}} --><p><?php esc_html_e( 'Checks booked in the next three weeks get done before the first big front. After that, our crew\'s diary fills with leaks.', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --></div><!-- /wp:column --></div><!-- /wp:columns --></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
