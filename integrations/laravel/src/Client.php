<?php

namespace Fernway\Laravel;

use Fernway\Laravel\Exceptions\KeyRefused;
use Fernway\Laravel\Exceptions\Refused;
use Fernway\Laravel\Exceptions\Unreachable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;

/** Fernway's API, as this package uses it. Every answer is sorted into taken, refused, or try again. */
class Client
{
    public function __construct(private Factory $http, private array $config) {}

    /** Delivers one lead now. Sending the same lead again (same key) gives the same waybill back, never a second lead. */
    public function send(Lead $lead): Sent
    {
        $r = $this->call(fn (PendingRequest $h) => $h->post('/api/v1/leads', $lead->toArray($this->config['route'] ?? null)));
        if ($r->status() === 201 || $r->status() === 200) {
            return Sent::from($r->json(), $lead->idempotencyKey());
        }
        $this->fail($r);
    }

    /** Free start times (UTC, ISO 8601) from a booking route's GHL calendar, for the next 14 days. Send one back with Lead::at(). */
    public function slots(string $route): array
    {
        $r = $this->call(fn (PendingRequest $h) => $h->get('/api/v1/routes/'.rawurlencode($route).'/slots'));
        if ($r->ok()) {
            return array_values((array) $r->json('slots', []));
        }
        $this->fail($r);
    }

    /** A lead by its waybill number ("FW 26 00817"): where it is, and every scan so far. */
    public function lead(string $number): array
    {
        $r = $this->call(fn (PendingRequest $h) => $h->get('/api/v1/leads/'.str_replace(' ', '-', trim($number))));
        if ($r->ok()) {
            return (array) $r->json('lead');
        }
        $this->fail($r);
    }

    /** True when Fernway accepts the key: it answers "no such lead" for a made-up number, which only a known key gets. */
    public function keyWorks(): bool
    {
        $r = $this->call(fn (PendingRequest $h) => $h->get('/api/v1/leads/FW-00-00000'));
        if ($r->status() === 404) {
            return true;
        }
        $this->fail($r);
    }

    private function call(callable $send): Response
    {
        if (empty($this->config['key'])) {
            throw new KeyRefused;
        }
        $request = $this->http->baseUrl(rtrim((string) $this->config['url'], '/'))
            ->withToken((string) $this->config['key'])
            ->acceptJson()
            ->asJson()
            ->timeout((int) ($this->config['timeout'] ?? 10))
            ->withUserAgent('Fernway-Laravel/1');
        try {
            return $send($request);
        } catch (ConnectionException $e) {
            throw new Unreachable('Fernway could not be reached: '.$e->getMessage());
        }
    }

    /** @return never */
    private function fail(Response $r): never
    {
        $status = $r->status();
        if ($status === 401) {
            throw new KeyRefused;
        }
        if ($status === 429 || $status >= 500) {
            $after = $r->header('Retry-After');
            throw new Unreachable("Fernway answered {$status}; the same lead can be sent again.", $status, is_numeric($after) ? (int) $after : null);
        }
        $problems = (array) $r->json('problems', []);
        throw new Refused($status, $problems ?: ["Fernway answered {$status}."]);
    }
}
