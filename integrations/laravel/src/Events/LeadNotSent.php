<?php

namespace Fernway\Laravel\Events;

use Fernway\Laravel\Lead;
use Illuminate\Foundation\Events\Dispatchable;

/** A queued lead used up its tries (Fernway down that long) or its key was refused. Sending it again later is safe. */
class LeadNotSent
{
    use Dispatchable;

    public function __construct(public readonly Lead $lead, public readonly string $reason) {}
}
