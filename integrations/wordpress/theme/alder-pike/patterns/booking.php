<?php
/**
 * Title: Book a free roof check
 * Slug: alder-pike/booking
 * Categories: alder-pike
 * Description: The booking form beside the receipt the visitor gets after sending.
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"align":"full","className":"ap-band","anchor":"book","layout":{"type":"constrained"}} -->
<div id="book" class="wp-block-group alignfull ap-band">
<!-- wp:group {"align":"wide","layout":{"type":"default"}} -->
<div class="wp-block-group alignwide"><!-- wp:group {"className":"ap-head","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between","verticalAlignment":"bottom"}} -->
<div class="wp-block-group ap-head"><!-- wp:group {"className":"ap-head-t","layout":{"type":"default"}} -->
<div class="wp-block-group ap-head-t"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'Book a free roof check', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading"><?php echo wp_kses_post( __( 'Your report card <mark>in 48 hours</mark>', 'alder-pike' ) ); ?></h2><!-- /wp:heading --></div>
<!-- /wp:group --><!-- wp:paragraph --><p><?php esc_html_e( 'Your request goes straight into our crew\'s diary. You get a receipt that shows it arriving, so you never wonder if it went through.', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:columns {"align":"wide","className":"ap-book"} -->
<div class="wp-block-columns alignwide ap-book"><!-- wp:column --><div class="wp-block-column"><!-- wp:fernway/form {"route":"roof-check","fields":["address","name","phone","email","slot","message"],"title":"Free roof check","submitLabel":"Book my check","note":"Morning or afternoon, from our crew diary","labels":{"address":"House address","email":"Email, for the report","message":"Anything we should know? (a leak, a skylight, an old roof)"}} /--></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:group {"className":"ap-track","layout":{"type":"default"}} -->
<div class="wp-block-group ap-track"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'What you see after sending', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'Your request, tracked', 'alder-pike' ); ?></h3><!-- /wp:heading --><!-- wp:group {"className":"ap-scan","layout":{"type":"default"}} -->
<div class="wp-block-group ap-scan"><!-- wp:paragraph {"className":"ap-scan-t"} --><p class="ap-scan-t"><?php esc_html_e( 'Picked up', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-d"} --><p class="ap-scan-d"><?php esc_html_e( 'From this page', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-at"} --><p class="ap-scan-at"><?php esc_html_e( '10:42:07', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"ap-scan","layout":{"type":"default"}} -->
<div class="wp-block-group ap-scan"><!-- wp:paragraph {"className":"ap-scan-t"} --><p class="ap-scan-t"><?php esc_html_e( 'Checked', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-d"} --><p class="ap-scan-d"><?php esc_html_e( 'Address and phone look right', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-at"} --><p class="ap-scan-at"><?php esc_html_e( '10:42:07', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"ap-scan","layout":{"type":"default"}} -->
<div class="wp-block-group ap-scan"><!-- wp:paragraph {"className":"ap-scan-t"} --><p class="ap-scan-t"><?php esc_html_e( 'Handed to our diary', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-d"} --><p class="ap-scan-d"><?php esc_html_e( 'A new roof check for the crew', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-at"} --><p class="ap-scan-at"><?php esc_html_e( '10:42:08', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"ap-scan","layout":{"type":"default"}} -->
<div class="wp-block-group ap-scan"><!-- wp:paragraph {"className":"ap-scan-t"} --><p class="ap-scan-t"><?php esc_html_e( 'Signed for', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-d"} --><p class="ap-scan-d"><?php esc_html_e( 'Our office has it', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"ap-scan-at"} --><p class="ap-scan-at"><?php esc_html_e( '10:42:08', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:paragraph {"className":"ap-track-by"} --><p class="ap-track-by"><?php echo wp_kses_post( __( 'A receipt like this, with its own number and link, delivered by <strong>Fernway</strong>.', 'alder-pike' ) ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
