<?php

namespace Fernway\Laravel\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * One of Fernway's signed webhooks, already checked. $data is the lead as Fernway saw it: waybill, state, route,
 * source, receipt, reason (GHL's words when held), contact, ghl ids, score.
 */
abstract class WebhookEvent
{
    use Dispatchable;

    public function __construct(public readonly string $id, public readonly string $type, public readonly string $created, public readonly array $data) {}

    public function waybill(): ?string
    {
        return $this->data['waybill'] ?? null;
    }

    public function contact(): array
    {
        return (array) ($this->data['contact'] ?? []);
    }
}
