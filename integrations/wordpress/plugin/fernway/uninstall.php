<?php
/**
 * Removing the plugin removes what it kept: its settings, the log, and the short-lived caches.
 *
 * @package Fernway
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

foreach ( array( 'fernway_url', 'fernway_api_key', 'fernway_route', 'fernway_country', 'fernway_area', 'fernway_hours', 'fernway_log' ) as $option ) {
	delete_option( $option );
}
global $wpdb;
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_fernway\\_%' OR option_name LIKE '\\_transient\\_timeout\\_fernway\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
wp_clear_scheduled_hook( 'fernway_log_purge' );
