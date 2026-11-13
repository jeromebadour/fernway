<?php
/**
 * Talks to Fernway's API with the site's key, from the server only: the key never reaches a visitor's browser.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Client {

	const DEFAULT_URL = 'https://fernway.jeromebadour.com';

	/** Fernway's address, without a trailing slash. */
	public static function base(): string {
		$url = (string) get_option( 'fernway_url', self::DEFAULT_URL );
		return untrailingslashit( '' !== $url ? $url : self::DEFAULT_URL );
	}

	public static function has_key(): bool {
		return '' !== self::key();
	}

	private static function key(): string {
		return (string) get_option( 'fernway_api_key', '' );
	}

	/**
	 * One call to the API. Answers with the status (0 when Fernway couldn't be reached) and the decoded JSON.
	 *
	 * @param string     $method GET or POST.
	 * @param string     $path   Starting with /api/v1/.
	 * @param array|null $body   Sent as JSON.
	 * @return array{status:int, json:array, error:string}
	 */
	public static function call( string $method, string $path, ?array $body = null ): array {
		if ( ! self::has_key() ) {
			return array( 'status' => 0, 'json' => array(), 'error' => __( 'No API key yet: add one under Settings, Fernway.', 'fernway' ) );
		}
		$args = array(
			'method'      => $method,
			'timeout'     => 12,
			'redirection' => 0,
			'headers'     => array(
				'Authorization' => 'Bearer ' . self::key(),
				'Accept'        => 'application/json',
				'User-Agent'    => 'Fernway-for-WordPress/' . FERNWAY_VERSION . '; ' . home_url( '/' ),
			),
		);
		if ( null !== $body ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = wp_json_encode( $body );
		}
		$res = wp_remote_request( self::base() . $path, $args );
		if ( is_wp_error( $res ) ) {
			return array( 'status' => 0, 'json' => array(), 'error' => $res->get_error_message() );
		}
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		return array(
			'status' => (int) wp_remote_retrieve_response_code( $res ),
			'json'   => is_array( $json ) ? $json : array(),
			'error'  => '',
		);
	}

	/** The first problem Fernway named, or a plain line for the status. */
	public static function problem( array $r ): string {
		if ( '' !== $r['error'] ) {
			return $r['error'];
		}
		$problems = $r['json']['problems'] ?? array();
		if ( is_array( $problems ) && $problems ) {
			return (string) $problems[0];
		}
		/* translators: %d: an HTTP status */
		return sprintf( __( 'Fernway answered %d.', 'fernway' ), $r['status'] );
	}
}
