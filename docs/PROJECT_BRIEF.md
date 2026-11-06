# PREMIUM TRAVEL AGENCY: PROJECT BRIEF

## 1. Project Overview

Build a professional website for a travel agency.

The website must have a **Premium Luxury Travel** interface that conveys luxury, reliability and professionalism.

The goal is a real business system, not just a promotional website.

## 2. Business Goals

- Introduce the travel brand.
- Promote domestic and international tours.
- Attract potential customers.
- Let customers search for tours and view tour details.
- Receive online tour bookings and payments, and private-trip inquiries.
- Manage tours and bookings through the admin panel.
- Optimize for SEO and scalability.

## 3. Target Customers

- Individual customers
- Families
- Groups of friends
- Corporate clients
- Clients who need private tours

## 4. Main Modules

### Customer Website

- Homepage
- Tour listings
- Tour details
- Destinations
- About us
- Travel blog
- Contact
- Booking

### Admin System

- Dashboard
- Tour management
- Destination management
- Departure management
- Booking management
- Customer management
- Blog management
- Media management

## 5. Design Direction

Premium Luxury Travel.

Style:

- Elegant
- Modern
- Editorial
- Minimalist
- Cinematic photography

Color direction:

- Deep Navy
- Warm Ivory
- Champagne Gold
- White
- Warm Gray

Details: `DESIGN_SYSTEM.md`.

## 6. Business Rules

- New bookings default to `pending` status.
- Do not confirm a reservation without checking availability.
- Do not confirm a payment without proof from the payment system.
- State tour prices clearly.
- Manage departure schedules separately from tours.
- Admins manage data according to their assigned permissions.

## 7. Success Criteria

- Responsive website.
- Tour data loaded from the database.
- Customers can submit bookings.
- Admins can manage tours and bookings.
- Authentication and permission management in place.
- Basic SEO implemented.
- Ready for production deployment.

## 8. Resolved Questions

Decided on 2026-11-06. Details in `DECISIONS.md`.

| Question | Decision | ADR |
| --- | --- | --- |
| Guest booking | Visitors can book and pay without an account. | ADR-005 |
| Customer accounts | Optional account with "My bookings"; guests look up bookings through an emailed link. | ADR-005 |
| Admin permissions | Several roles: sales, sales manager, operator, accountant, editor, admin. | ADR-009 |
| Online payment | In scope for launch: VNPay and VietQR bank transfer. Payment is confirmed only by the payment system. | ADR-005, ADR-013 |
| Languages and currency | Vietnamese (default) and English; prices in VND. | ADR-006 |
| Private and corporate tours | Separate consultation inquiry; sales sends a quote and a payment link. Corporate clients can request a VAT invoice. | ADR-005, ADR-016 |
| Dark mode | Proposed: fixed light theme on the public website, navy sections for contrast. | ADR-017 (proposed) |

## 9. Still Open

Information only the project owner can provide:

- Brand name, logo and domain; whether an existing website needs SEO migration.
- Actual deposit rate, balance due period and cancellation refund tiers.
- VNPay contract status, limits and fees for high-value transactions.
- Receiving bank account; SePay or Casso for bank-transfer reconciliation.
- Number of tours and articles at launch; who owns photography and bilingual content.
- Tour operator licence and e-commerce website notification status.
- Main consultation channel: Zalo OA, WhatsApp Business or both.
- Monthly infrastructure budget (ADR-018).
- Whether the sales manager may edit departure prices (ADR-016).
