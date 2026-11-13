<?php
/**
 * Plugin Name:       Fernway for WordPress
 * Plugin URI:        https://fernway.jeromebadour.com/docs/wordpress
 * Description:       Forms whose leads reach GoHighLevel and can be tracked: every send gets a waybill and a receipt. A block for the editor, an Elementor widget, a settings page with a connection test, and a log of recent sends.
 * Version:           1.0.0
 * Requires at least: 6.7
 * Requires PHP:      8.1
 * Author:            Jerome Badour
 * Author URI:        https://jeromebadour.com
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       fernway
 *
 * @package Fernway
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FERNWAY_VERSION', '1.0.0' );
define( 'FERNWAY_FILE', __FILE__ );
define( 'FERNWAY_DIR', plugin_dir_path( __FILE__ ) );
define( 'FERNWAY_URL', plugin_dir_url( __FILE__ ) );

require_once FERNWAY_DIR . 'includes/class-client.php';
require_once FERNWAY_DIR . 'includes/class-log.php';
require_once FERNWAY_DIR . 'includes/class-settings.php';
require_once FERNWAY_DIR . 'includes/class-lead.php';
require_once FERNWAY_DIR . 'includes/class-form.php';
require_once FERNWAY_DIR . 'includes/class-rest.php';

Fernway\Settings::boot();
Fernway\Log::boot();
Fernway\Form::boot();
Fernway\Rest::boot();

add_action(
	'elementor/widgets/register',
	static function ( $widgets ) {
		require_once FERNWAY_DIR . 'includes/class-elementor-widget.php';
		$widgets->register( new Fernway\Elementor_Widget() );
	}
);

register_activation_hook( __FILE__, array( 'Fernway\\Log', 'schedule' ) );
register_deactivation_hook( __FILE__, array( 'Fernway\\Log', 'unschedule' ) );
