<?php

namespace Fernway\Laravel\Exceptions;

use RuntimeException;

/** Fernway refused the lead (a field it won't take, a time already taken): sending it again won't help. */
final class Refused extends RuntimeException
{
    /** @param list<string> $problems Fernway's own words, one line each, the field first. */
    public function __construct(public readonly int $status, public readonly array $problems)
    {
        parent::__construct('Fernway refused the lead ('.$status.'): '.implode('; ', $problems));
    }
}
