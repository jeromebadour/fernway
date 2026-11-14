<?php

namespace Fernway\Laravel;

use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * One lead, as Fernway takes it. Its idempotency key is made when the lead is, so every try of the same lead (a queue
 * retry, a send after a timeout) carries the same key and Fernway delivers it once.
 */
final class Lead
{
    private array $contact = [];

    private ?string $slot = null;

    private function __construct(private ?string $route, private string $key) {}

    /** A lead on a route (the GHL pipeline, stage and tags it lands in); none means the config's default route. */
    public static function to(?string $route = null): self
    {
        return new self($route, 'laravel-'.Str::uuid()->toString());
    }

    /** Your own id for this lead (an order or form-entry id), so sending it again can never make a second one. */
    public function key(string $key): self
    {
        $key = trim($key);
        if (strlen($key) < 8 || strlen($key) > 200) {
            throw new InvalidArgumentException('A lead key is 8 to 200 characters, like an order or form-entry id.');
        }
        $this->key = $key;

        return $this;
    }

    public function name(string $first, ?string $last = null): self
    {
        return $this->set('firstName', $first)->set('lastName', $last);
    }

    public function email(?string $email): self
    {
        return $this->set('email', $email);
    }

    /** With its country code, like +1 503 555 0142; spaces, dots and brackets are fine. */
    public function phone(?string $phone): self
    {
        return $this->set('phone', $phone);
    }

    public function company(?string $name): self
    {
        return $this->set('companyName', $name);
    }

    public function website(?string $url): self
    {
        return $this->set('website', $url);
    }

    /** Added to the contact in GHL as a note. */
    public function message(?string $text): self
    {
        return $this->set('message', $text);
    }

    /** Where the work is, to the contact's own address fields in GHL. Country is two letters, like US. */
    public function address(?string $line1 = null, ?string $city = null, ?string $state = null, ?string $postalCode = null, ?string $country = null): self
    {
        $parts = array_filter(compact('line1', 'city', 'state', 'postalCode', 'country'), fn ($v) => $v !== null && trim($v) !== '');
        if ($parts) {
            $this->contact['address'] = array_map('trim', $parts);
        }

        return $this;
    }

    /** Booking routes only: a free time from Fernway::slots(), as it came. */
    public function at(string $slot): self
    {
        $this->slot = $slot;

        return $this;
    }

    public function idempotencyKey(): string
    {
        return $this->key;
    }

    public function route(): ?string
    {
        return $this->route;
    }

    /** The body Fernway's API takes; the route falls back to the config's. */
    public function toArray(?string $defaultRoute = null): array
    {
        $route = $this->route ?? $defaultRoute;
        if ($route === null || $route === '') {
            throw new InvalidArgumentException('This lead names no route, and fernway.route (FERNWAY_ROUTE) is not set.');
        }

        return array_filter([
            'idempotencyKey' => $this->key,
            'source' => 'laravel',
            'route' => $route,
            'slot' => $this->slot,
            'contact' => $this->contact,
        ], fn ($v) => $v !== null);
    }

    /** For the queue: a lead travels as its own fields and comes back the same, key included. */
    public function __serialize(): array
    {
        return ['route' => $this->route, 'key' => $this->key, 'contact' => $this->contact, 'slot' => $this->slot];
    }

    public function __unserialize(array $data): void
    {
        ['route' => $this->route, 'key' => $this->key, 'contact' => $this->contact, 'slot' => $this->slot] = $data;
    }

    private function set(string $field, ?string $value): self
    {
        if ($value === null || trim($value) === '') {
            unset($this->contact[$field]);
        } else {
            $this->contact[$field] = trim($value);
        }

        return $this;
    }
}
