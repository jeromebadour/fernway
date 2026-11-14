<?php

namespace Fernway\Laravel;

/** Fernway took the lead: its waybill number, where it is, and the receipt to hand to the person who sent it. */
final class Sent
{
    public function __construct(
        public readonly string $number,
        public readonly string $state,
        public readonly bool $duplicate,
        public readonly ?string $receipt,
        public readonly string $key,
    ) {}

    public static function from(array $json, string $key): self
    {
        return new self((string) $json['number'], (string) ($json['state'] ?? 'picked_up'), (bool) ($json['duplicate'] ?? false), $json['links']['receipt'] ?? null, $key);
    }
}
