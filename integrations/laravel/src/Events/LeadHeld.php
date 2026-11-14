<?php

namespace Fernway\Laravel\Events;

/** GHL refused the lead for a reason waiting won't fix; reason() says why, in GHL's words. (lead.held) */
class LeadHeld extends WebhookEvent
{
    public function reason(): ?string
    {
        return $this->data['reason'] ?? null;
    }
}
