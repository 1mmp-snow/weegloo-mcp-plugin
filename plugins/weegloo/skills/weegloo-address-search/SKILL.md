---
name: weegloo-address-search
description: Address input in a form — a signup or profile address, a checkout shipping address, an address book — for addresses outside South Korea. Plain free-text fields; no lookup widget and no API key to ask for. 주소 입력, 배송지 주소, 해외 주소.
---

# Address input

There is no dedicated address lookup to wire here. Use plain form fields:

- Free-text inputs: address line 1, address line 2 (optional), city, state or region, postal code, and a country select.
- Do not add an address or postcode search widget, and do not ask the user for an API key, unless they name a provider themselves.
- Store the parts as ordinary text fields of the member's Content — field types per `weegloo-create-content-type`.
