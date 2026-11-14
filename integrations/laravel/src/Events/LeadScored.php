<?php

namespace Fernway\Laravel\Events;

/** Claude scored the lead (when the account turned lead score on); score() is 1 to 5. (lead.scored) */
class LeadScored extends WebhookEvent
{
    public function score(): ?int
    {
        return isset($this->data['score']['score']) ? (int) $this->data['score']['score'] : null;
    }
}
