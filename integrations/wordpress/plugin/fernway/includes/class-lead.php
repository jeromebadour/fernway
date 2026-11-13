<?php
/**
 * What a visitor typed, made into a Fernway lead: a name split in two, a phone number with its country code, an
 * address read from one line, a booking time. Problems come back per field, in words a visitor can act on.
 *
 * @package Fernway
 */

namespace Fernway;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Lead {

	/** Calling codes for the countries whose local numbers are read without a +; others need the +. */
	const CALLING = array( 'US' => '1', 'CA' => '1', 'GB' => '44', 'IE' => '353', 'AU' => '61', 'NZ' => '64', 'DE' => '49', 'FR' => '33', 'NL' => '31', 'ES' => '34', 'IT' => '39' );

	/**
	 * @param array<string,string> $in      The form's fields: name, email, phone, address, company, message, slot.
	 * @param string[]             $fields  Which fields the form shows.
	 * @param string               $country The site's country, two letters.
	 * @return array{ok:bool, contact:array, slot:?string, problems:array<string,string>, area:?bool}
	 */
	public static function from_form( array $in, array $fields, string $country ): array {
		$problems = array();
		$contact  = array();
		$v        = static fn( string $k ): string => trim( (string) ( $in[ $k ] ?? '' ) );

		if ( in_array( 'name', $fields, true ) && '' !== $v( 'name' ) ) {
			$parts                = preg_split( '/\s+/', $v( 'name' ), 2 );
			$contact['firstName'] = mb_substr( $parts[0], 0, 80 );
			if ( isset( $parts[1] ) ) {
				$contact['lastName'] = mb_substr( $parts[1], 0, 80 );
			}
		}
		if ( in_array( 'email', $fields, true ) && '' !== $v( 'email' ) ) {
			if ( ! is_email( $v( 'email' ) ) ) {
				$problems['email'] = __( 'That email address is missing a part, like name@example.com.', 'fernway' );
			} else {
				$contact['email'] = strtolower( $v( 'email' ) );
			}
		}
		if ( in_array( 'phone', $fields, true ) && '' !== $v( 'phone' ) ) {
			$phone = self::phone( $v( 'phone' ), $country );
			if ( is_array( $phone ) ) {
				$problems['phone'] = $phone['problem'];
			} else {
				$contact['phone'] = $phone;
			}
		}
		if ( in_array( 'company', $fields, true ) && '' !== $v( 'company' ) ) {
			$contact['companyName'] = mb_substr( $v( 'company' ), 0, 120 );
		}
		if ( in_array( 'message', $fields, true ) && '' !== $v( 'message' ) ) {
			$contact['message'] = mb_substr( $v( 'message' ), 0, 2000 );
		}
		$area = null;
		if ( in_array( 'address', $fields, true ) ) {
			if ( '' === $v( 'address' ) ) {
				$problems['address'] = __( 'The address, so we know where to come.', 'fernway' );
			} else {
				$contact['address'] = self::address( $v( 'address' ), $country );
				$area               = self::in_area( $contact['address']['postalCode'] ?? null );
			}
		}
		$slot = null;
		if ( in_array( 'slot', $fields, true ) ) {
			$t = strtotime( $v( 'slot' ) );
			if ( false === $t || $t < time() ) {
				$problems['slot'] = __( 'Pick a day and a time.', 'fernway' );
			} else {
				$slot = gmdate( 'Y-m-d\TH:i:s.000\Z', $t );
			}
		}
		if ( ! $problems && empty( $contact['email'] ) && empty( $contact['phone'] ) ) {
			$key              = in_array( 'phone', $fields, true ) ? 'phone' : 'email';
			$problems[ $key ] = in_array( 'phone', $fields, true ) && in_array( 'email', $fields, true )
				? __( 'A phone number or an email, so we can reach you.', 'fernway' )
				: ( 'phone' === $key ? __( 'A phone number, so we can reach you.', 'fernway' ) : __( 'An email address, so we can reach you.', 'fernway' ) );
		}
		return array( 'ok' => ! $problems, 'contact' => $contact, 'slot' => $slot, 'problems' => $problems, 'area' => $area );
	}

	/**
	 * A phone number as GoHighLevel wants it (+ and digits), or the problem with it.
	 *
	 * @return string|array{problem:string}
	 */
	public static function phone( string $raw, string $country ) {
		$plus   = str_starts_with( ltrim( $raw ), '+' );
		$digits = preg_replace( '/\D+/', '', $raw );
		if ( $plus ) {
			return strlen( $digits ) >= 8 && strlen( $digits ) <= 15 ? '+' . $digits : array( 'problem' => __( 'That number looks too short or too long.', 'fernway' ) );
		}
		$code = self::CALLING[ $country ] ?? null;
		if ( '1' === $code ) {
			if ( 11 === strlen( $digits ) && '1' === $digits[0] ) {
				$digits = substr( $digits, 1 );
			}
			if ( strlen( $digits ) < 10 ) {
				$words = array( 1 => __( 'One digit short', 'fernway' ), 2 => __( 'Two digits short', 'fernway' ), 3 => __( 'Three digits short', 'fernway' ) );
				$short = 10 - strlen( $digits );
				/* translators: %s: "Two digits short" and the like */
				return array( 'problem' => sprintf( __( '%s: a US number has 10.', 'fernway' ), $words[ $short ] ?? __( 'Too few digits', 'fernway' ) ) );
			}
			if ( strlen( $digits ) > 10 ) {
				return array( 'problem' => __( 'Too many digits: a US number has 10.', 'fernway' ) );
			}
			return '+1' . $digits;
		}
		if ( null === $code ) {
			return array( 'problem' => __( 'Start with + and the country code, like +44 20 7946 0958.', 'fernway' ) );
		}
		$digits = ltrim( $digits, '0' );
		return strlen( $digits ) >= 6 ? '+' . $code . $digits : array( 'problem' => __( 'That number looks too short.', 'fernway' ) );
	}

	/** "14 Cedar Ln, Tacoma, WA 98406" into its parts; whatever can't be placed stays in the first line. */
	public static function address( string $raw, string $country ): array {
		$parts = array_values( array_filter( array_map( 'trim', explode( ',', $raw ) ), 'strlen' ) );
		$out   = array( 'country' => $country );
		$last  = end( $parts );
		if ( count( $parts ) >= 2 && preg_match( '/^([A-Za-z]{2})?\s*(\d{5}(?:-\d{4})?)?$/', (string) $last, $m ) && ( ! empty( $m[1] ) || ! empty( $m[2] ) ) ) {
			if ( ! empty( $m[1] ) ) {
				$out['state'] = strtoupper( $m[1] );
			}
			if ( ! empty( $m[2] ) ) {
				$out['postalCode'] = $m[2];
			}
			array_pop( $parts );
		} elseif ( preg_match( '/\b(\d{5})(?:-\d{4})?\s*$/', $raw, $z ) ) {
			$out['postalCode'] = $z[1];
		}
		// The city is the last part left; everything before it is the street line ("2210 S Tacoma Way, Unit 4").
		if ( count( $parts ) >= 2 ) {
			$out['city'] = mb_substr( (string) array_pop( $parts ), 0, 100 );
		}
		$out['line1'] = mb_substr( implode( ', ', $parts ), 0, 200 );
		return array_filter( $out, 'strlen' );
	}

	/** Inside the service area? Null when no area is set or the address has no ZIP. */
	public static function in_area( ?string $zip ): ?bool {
		$area = array_filter( array_map( 'trim', explode( ',', (string) get_option( 'fernway_area', '' ) ) ) );
		if ( ! $area || ! $zip ) {
			return null;
		}
		foreach ( $area as $start ) {
			if ( str_starts_with( $zip, $start ) ) {
				return true;
			}
		}
		return false;
	}
}
