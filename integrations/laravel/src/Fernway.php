<?php

namespace Fernway\Laravel;

use Fernway\Laravel\Jobs\SendLead;

/** What the Fernway facade fronts: send a lead on the queue or now, read free times, look a lead up. */
class Fernway
{
    public function __construct(private Client $client, private array $config) {}

    /** Queues the lead and returns its idempotency key at once; LeadSent or LeadRefused follows when Fernway answers. */
    public function send(Lead $lead): string
    {
        $job = new SendLead($lead);
        $queue = $this->config['queue'] ?? [];
        if (! empty($queue['connection'])) {
            $job->onConnection($queue['connection']);
        }
        if (! empty($queue['name'])) {
            $job->onQueue($queue['name']);
        }
        dispatch($job);

        return $lead->idempotencyKey();
    }

    /** Sends now and returns the waybill, or throws Refused, Unreachable or KeyRefused. */
    public function sendNow(Lead $lead): Sent
    {
        return $this->client->send($lead);
    }

    public function slots(?string $route = null): array
    {
        return $this->client->slots($route ?? (string) ($this->config['route'] ?? ''));
    }

    public function lead(string $number): array
    {
        return $this->client->lead($number);
    }
}
