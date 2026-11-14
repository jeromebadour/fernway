<?php

namespace Fernway\Laravel\Http;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets through only what Fernway signed. Fernway-Signature is "t=<unix seconds>,v1=<hex>", the hex an HMAC-SHA256 of
 * "<t>.<the body as sent>" with the endpoint's secret: checked on the raw body, compared in constant time, and refused
 * when the time is more than the tolerance away, so an old call can't be played again. Anything else gets a 400.
 */
class VerifySignature
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('fernway.webhooks.secret');
        $parts = [];
        foreach (explode(',', (string) $request->header('Fernway-Signature')) as $pair) {
            [$k, $v] = array_pad(explode('=', trim($pair), 2), 2, '');
            $parts[$k] = $v;
        }
        $t = $parts['t'] ?? '';
        $fresh = ctype_digit($t) && abs(time() - (int) $t) <= (int) config('fernway.webhooks.tolerance', 300);
        $want = hash_hmac('sha256', $t.'.'.$request->getContent(), $secret);
        if ($secret === '' || ! $fresh || ! hash_equals($want, (string) ($parts['v1'] ?? ''))) {
            return response()->json(['ok' => false, 'problem' => 'bad signature'], 400);
        }

        return $next($request);
    }
}
