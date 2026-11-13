<?php
/**
 * The form's three calls from the visitor's browser: send, the receipt as it moves, and the booking as a calendar
 * file. The site's key is used here on the server; the browser only ever sees what these answer.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rest {

	public static function boot(): void {
		add_action( 'rest_api_init', array( self::class, 'routes' ) );
	}

	public static function routes(): void {
		register_rest_route( 'fernway/v1', '/send', array( 'methods' => 'POST', 'callback' => array( self::class, 'send' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( 'fernway/v1', '/receipt', array( 'methods' => 'GET', 'callback' => array( self::class, 'receipt' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( 'fernway/v1', '/calendar', array( 'methods' => 'GET', 'callback' => array( self::class, 'calendar' ), 'permission_callback' => '__return_true' ) );
	}

	public static function send( \WP_REST_Request $req ): \WP_REST_Response {
		$in       = (array) $req->get_body_params();
		$settings = Form::verified( (string) ( $in['fw_settings'] ?? '' ), (string) ( $in['fw_settings_sig'] ?? '' ) );
		if ( null === $settings ) {
			return new \WP_REST_Response( array( 'ok' => false, 'problems' => array( 'form' => __( 'This form is out of date. Please reload the page.', 'fernway' ) ) ), 400 );
		}
		$page = (string) wp_parse_url( (string) $req->get_header( 'referer' ), PHP_URL_PATH );
		$res  = Form::send( $in, $settings, $page );
		if ( ! $res['ok'] ) {
			return new \WP_REST_Response( array( 'ok' => false, 'problems' => $res['problems'] ), $res['status'] );
		}
		if ( '' === $res['number'] ) {
			return new \WP_REST_Response( array( 'ok' => true, 'html' => '' ), 200 );
		}
		$lead = Client::call( 'GET', '/api/v1/leads/' . str_replace( ' ', '-', $res['number'] ) );
		return new \WP_REST_Response(
			array(
				'ok'     => true,
				'number' => $res['number'],
				'sig'    => $res['sig'],
				'booked' => (string) $res['booked'],
				'first'  => (string) $res['first'],
				'area'   => $res['area'],
				'html'   => Form::receipt_inner( $res['number'], $res['sig'], (string) $res['booked'], (string) $res['first'], 200 === $lead['status'] ? (array) ( $lead['json']['lead'] ?? array() ) : array() ),
			),
			201
		);
	}

	/** The receipt redrawn: only for a number this site signed when it sent it. */
	public static function receipt( \WP_REST_Request $req ): \WP_REST_Response {
		$number = (string) $req->get_param( 'n' );
		if ( ! preg_match( '/^FW \d{2} \d{5}$/', $number ) || ! Form::signed( $number, (string) $req->get_param( 't' ) ) ) {
			return new \WP_REST_Response( array( 'ok' => false ), 404 );
		}
		$lead = Client::call( 'GET', '/api/v1/leads/' . str_replace( ' ', '-', $number ) );
		if ( 200 !== $lead['status'] ) {
			return new \WP_REST_Response( array( 'ok' => false ), 503 );
		}
		$data = (array) ( $lead['json']['lead'] ?? array() );
		$res  = new \WP_REST_Response(
			array(
				'ok'     => true,
				'moving' => ! in_array( (string) ( $data['state'] ?? '' ), array( 'signed', 'held', 'returned' ), true ),
				'html'   => Form::receipt_inner( $number, (string) $req->get_param( 't' ), (string) $req->get_param( 'b' ), sanitize_text_field( (string) $req->get_param( 'f' ) ), $data ),
			),
			200
		);
		$res->header( 'Cache-Control', 'no-store' );
		return $res;
	}

	/** The booking as an .ics file, its time read from Fernway (never from the link), so it can't be made to say anything else. */
	public static function calendar( \WP_REST_Request $req ) {
		$number = (string) $req->get_param( 'n' );
		if ( ! preg_match( '/^FW \d{2} \d{5}$/', $number ) || ! Form::signed( $number, (string) $req->get_param( 't' ) ) ) {
			return new \WP_REST_Response( array( 'ok' => false ), 404 );
		}
		$lead    = Client::call( 'GET', '/api/v1/leads/' . str_replace( ' ', '-', $number ) );
		$meeting = (string) ( $lead['json']['lead']['meeting'] ?? '' );
		$start   = $meeting ? strtotime( $meeting ) : false;
		if ( ! $start ) {
			return new \WP_REST_Response( array( 'ok' => false ), 404 );
		}
		$fmt  = static fn( int $t ): string => gmdate( 'Ymd\THis\Z', $t );
		$name = wp_strip_all_tags( get_bloginfo( 'name' ) );
		$esc  = static fn( string $v ): string => str_replace( array( '\\', ';', ',', "\n" ), array( '\\\\', '\;', '\,', '\n' ), $v );
		$ics  = implode(
			"\r\n",
			array(
				'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fernway for WordPress//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
				'BEGIN:VEVENT',
				'UID:' . str_replace( ' ', '', $number ) . '@' . wp_parse_url( home_url(), PHP_URL_HOST ),
				'DTSTAMP:' . $fmt( time() ),
				'DTSTART:' . $fmt( $start ),
				'DTEND:' . $fmt( $start + HOUR_IN_SECONDS ),
				'SUMMARY:' . $esc( $name . ': ' . __( 'your booking', 'fernway' ) ),
				'DESCRIPTION:' . $esc( __( 'Receipt', 'fernway' ) . ' ' . $number ),
				'END:VEVENT', 'END:VCALENDAR', '',
			)
		);
		header( 'Content-Type: text/calendar; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="booking-' . str_replace( ' ', '-', $number ) . '.ics"' );
		header( 'Cache-Control: no-store' );
		echo $ics; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}
}
