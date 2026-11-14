<?php

namespace Fernway\Laravel\Events;

use Fernway\Laravel\Lead;
use Fernway\Laravel\Sent;
use Illuminate\Foundation\Events\Dispatchable;

/** Fernway took a queued lead: $sent->number is its waybill, $sent->receipt the page to hand to whoever sent it. */
class LeadSent
{
    use Dispatchable;

    public function __construct(public readonly Lead $lead, public readonly Sent $sent) {}
}
