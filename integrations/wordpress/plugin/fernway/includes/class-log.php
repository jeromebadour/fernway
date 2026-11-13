<?php
/**
 * The last 50 sends, so the site owner can see the form working: when, which route, what Fernway answered, and the
 * waybill. Never what the visitor typed. Entries older than 30 days are removed every day and on every write.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Log {

	const OPTION = 'fernway_log';
	const KEEP   = 50;
	const DAYS   = 30;
	const HOOK   = 'fernway_log_purge';

	public static function boot(): void {
		add_action( self::HOOK, array( self::class, 'purge' ) );
		// Also scheduled here, so a plugin copied in without activation still empties its log.
		add_action( 'init', array( self::class, 'schedule' ) );
	}

	public static function schedule(): void {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::HOOK );
		}
	}

	public static function unschedule(): void {
		wp_clear_scheduled_hook( self::HOOK );
	}

	/**
	 * One send: `outcome` is sent, duplicate, refused, taken, limited or unreachable.
	 *
	 * @param array{route:string, outcome:string, status:int, number?:string, problem?:string, page?:string} $entry The send.
	 */
	public static function add( array $entry ): void {
		$entries = self::fresh( self::all() );
		array_unshift(
			$entries,
			array(
				'at'      => time(),
				'route'   => (string) $entry['route'],
				'outcome' => (string) $entry['outcome'],
				'status'  => (int) $entry['status'],
				'number'  => (string) ( $entry['number'] ?? '' ),
				'problem' => mb_substr( (string) ( $entry['problem'] ?? '' ), 0, 300 ),
				'page'    => mb_substr( (string) ( $entry['page'] ?? '' ), 0, 200 ),
			)
		);
		update_option( self::OPTION, array_slice( $entries, 0, self::KEEP ), false );
	}

	/** @return array<int, array<string, mixed>> Newest first. */
	public static function all(): array {
		$v = get_option( self::OPTION, array() );
		return is_array( $v ) ? $v : array();
	}

	public static function purge(): void {
		$all  = self::all();
		$kept = self::fresh( $all );
		if ( count( $kept ) !== count( $all ) ) {
			update_option( self::OPTION, $kept, false );
		}
	}

	private static function fresh( array $entries ): array {
		$cut = time() - self::DAYS * DAY_IN_SECONDS;
		return array_values( array_filter( $entries, static fn( $e ) => (int) ( $e['at'] ?? 0 ) >= $cut ) );
	}
}
