<?php

namespace Fernway\Laravel\Events;

use Fernway\Laravel\Lead;
use Illuminate\Foundation\Events\Dispatchable;

/** Fernway refused a queued lead and it won't be tried again: $problems says what to change, the field first. */
class LeadRefused
{
    use Dispatchable;

    /** @param list<string> $problems */
    public function __construct(public readonly Lead $lead, public readonly int $status, public readonly array $problems) {}
}
