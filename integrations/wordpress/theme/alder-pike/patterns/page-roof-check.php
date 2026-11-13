<?php
/**
 * Title: Roof check page
 * Slug: alder-pike/page-roof-check
 * Categories: alder-pike, pages
 * Description: The booking page: the full form with what happens next beside it.
 *
 * @package AlderPike
 */
?>
<!-- wp:group {"align":"full","className":"ap-page","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull ap-page">
<!-- wp:group {"align":"wide","layout":{"type":"default"}} -->
<div class="wp-block-group alignwide"><!-- wp:columns {"align":"wide","className":"ap-rc"} --><div class="wp-block-columns alignwide ap-rc"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'Book a free roof check', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading {"level":1} --><h1 class="wp-block-heading"><?php esc_html_e( 'Your report card in 48 hours.', 'alder-pike' ); ?></h1><!-- /wp:heading --><!-- wp:paragraph {"className":"ap-lede"} --><p class="ap-lede"><?php esc_html_e( 'Two minutes here; 45 minutes on your roof. You don\'t need to be home.', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:fernway/form {"route":"roof-check","fields":["address","name","phone","email","slot","message"],"title":"Free roof check","submitLabel":"Book my check","note":"Morning or afternoon, from our crew diary","labels":{"address":"House address","email":"Email, for the report","message":"Anything we should know? (a leak, a skylight, an old roof)"}} /--></div><!-- /wp:column --><!-- wp:column {"width":"420px"} --><div class="wp-block-column" style="flex-basis:420px"><!-- wp:group {"className":"ap-box","layout":{"type":"default"}} -->
<div class="wp-block-group ap-box"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'What happens next', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'The day of your check', 'alder-pike' ); ?></h3><!-- /wp:heading --><!-- wp:list {"className":"ap-plan"} --><ul class="wp-block-list ap-plan"><!-- wp:list-item --><li><?php echo wp_kses_post( __( '<strong>Day before</strong> a call to confirm the time', 'alder-pike' ) ); ?></li><!-- /wp:list-item --><!-- wp:list-item --><li><?php echo wp_kses_post( __( '<strong>On the day</strong> 45 min, ladder and attic hatch', 'alder-pike' ) ); ?></li><!-- /wp:list-item --><!-- wp:list-item --><li><?php echo wp_kses_post( __( '<strong>Within 48 h</strong> report card, by email', 'alder-pike' ) ); ?></li><!-- /wp:list-item --><!-- wp:list-item --><li><?php echo wp_kses_post( __( '<strong>If needed</strong> a fixed price, valid 60 days', 'alder-pike' ) ); ?></li><!-- /wp:list-item --></ul><!-- /wp:list --></div>
<!-- /wp:group --><!-- wp:group {"className":"ap-box","layout":{"type":"default"}} -->
<div class="wp-block-group ap-box"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'After you send', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'A receipt you can check', 'alder-pike' ); ?></h3><!-- /wp:heading --><!-- wp:paragraph --><p><?php esc_html_e( 'The next screen shows your request arriving in our diary, step by step, with a link to check it again later. Delivered by Fernway.', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --><!-- wp:group {"className":"ap-box","layout":{"type":"default"}} -->
<div class="wp-block-group ap-box"><!-- wp:paragraph {"className":"ap-kick"} --><p class="ap-kick"><?php esc_html_e( 'Active leak?', 'alder-pike' ); ?></p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'Call, don\'t book', 'alder-pike' ); ?></h3><!-- /wp:heading --><!-- wp:paragraph --><p><?php esc_html_e( '(253) 555 0187, seven days. We tarp first and talk after.', 'alder-pike' ); ?></p><!-- /wp:paragraph --></div>
<!-- /wp:group --></div><!-- /wp:column --></div><!-- /wp:columns --></div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
