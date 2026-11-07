
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"changes": Json | null,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"ip": unknown,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"ip"?: unknown,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changes"?: Json | null,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"ip"?: unknown,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_access_tokens": {
                  Row: {
                    "booking_id": string,"created_at": string,"expires_at": string,"id": string,"purpose": string,"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"purpose": string,"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "booking_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"purpose"?: string,"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_access_tokens_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "actor_id": string | null,"booking_id": string,"created_at": string,"from_status": Database["public"]['Enums']["booking_status"] | null,"id": string,"message": string | null,"to_status": Database["public"]['Enums']["booking_status"] | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"booking_id": string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: string,"message"?: string | null,"to_status"?: Database["public"]['Enums']["booking_status"] | null,"type": string
                  }
                  Update: {
                    "actor_id"?: string | null,"booking_id"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: string,"message"?: string | null,"to_status"?: Database["public"]['Enums']["booking_status"] | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_items": {
                  Row: {
                    "amount": number,"booking_id": string,"id": string,"label": string,"quantity": number,"type": Database["public"]['Enums']["booking_item_type"],"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"booking_id": string,"id"?: string,"label": string,"quantity": number,"type": Database["public"]['Enums']["booking_item_type"],"unit_price": number
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"id"?: string,"label"?: string,"quantity"?: number,"type"?: Database["public"]['Enums']["booking_item_type"],"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_items_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "adults": number,"amount_paid": number,"assigned_to": string | null,"attention_reason": string | null,"balance_due_date": string | null,"cancel_reason": string | null,"cancellation_policy_snapshot": Json | null,"cancelled_at": string | null,"children": number,"code": string,"contact_country": string | null,"contact_email": string,"contact_name": string,"contact_phone": string,"created_at": string,"currency": string,"customer_id": string | null,"departure_id": string | null,"deposit_amount": number,"discount_total": number,"hold_expires_at": string | null,"id": string,"idempotency_key": string | null,"infants": number,"inquiry_id": string | null,"invoice_info": Json | null,"invoice_requested": boolean,"locale": Database["public"]['Enums']["locale"],"needs_attention": boolean,"payment_plan": Database["public"]['Enums']["payment_plan"],"payment_state": Database["public"]['Enums']["booking_payment_state"],"quote_expires_at": string | null,"single_rooms": number,"special_requests": string | null,"start_date": string,"status": Database["public"]['Enums']["booking_status"],"subtotal": number,"terms_version": string | null,"total": number,"tour_id": string,"tour_snapshot": NonNullable<Json>,"type": Database["public"]['Enums']["booking_type"],"updated_at": string,"utm": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "adults": number,"amount_paid"?: number,"assigned_to"?: string | null,"attention_reason"?: string | null,"balance_due_date"?: string | null,"cancel_reason"?: string | null,"cancellation_policy_snapshot"?: Json | null,"cancelled_at"?: string | null,"children"?: number,"code": string,"contact_country"?: string | null,"contact_email": string,"contact_name": string,"contact_phone": string,"created_at"?: string,"currency"?: string,"customer_id"?: string | null,"departure_id"?: string | null,"deposit_amount": number,"discount_total"?: number,"hold_expires_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"infants"?: number,"inquiry_id"?: string | null,"invoice_info"?: Json | null,"invoice_requested"?: boolean,"locale": Database["public"]['Enums']["locale"],"needs_attention"?: boolean,"payment_plan": Database["public"]['Enums']["payment_plan"],"payment_state"?: Database["public"]['Enums']["booking_payment_state"],"quote_expires_at"?: string | null,"single_rooms"?: number,"special_requests"?: string | null,"start_date": string,"status"?: Database["public"]['Enums']["booking_status"],"subtotal": number,"terms_version"?: string | null,"total": number,"tour_id": string,"tour_snapshot": NonNullable<Json>,"type": Database["public"]['Enums']["booking_type"],"updated_at"?: string,"utm"?: Json | null
                  }
                  Update: {
                    "adults"?: number,"amount_paid"?: number,"assigned_to"?: string | null,"attention_reason"?: string | null,"balance_due_date"?: string | null,"cancel_reason"?: string | null,"cancellation_policy_snapshot"?: Json | null,"cancelled_at"?: string | null,"children"?: number,"code"?: string,"contact_country"?: string | null,"contact_email"?: string,"contact_name"?: string,"contact_phone"?: string,"created_at"?: string,"currency"?: string,"customer_id"?: string | null,"departure_id"?: string | null,"deposit_amount"?: number,"discount_total"?: number,"hold_expires_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"infants"?: number,"inquiry_id"?: string | null,"invoice_info"?: Json | null,"invoice_requested"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"needs_attention"?: boolean,"payment_plan"?: Database["public"]['Enums']["payment_plan"],"payment_state"?: Database["public"]['Enums']["booking_payment_state"],"quote_expires_at"?: string | null,"single_rooms"?: number,"special_requests"?: string | null,"start_date"?: string,"status"?: Database["public"]['Enums']["booking_status"],"subtotal"?: number,"terms_version"?: string | null,"total"?: number,"tour_id"?: string,"tour_snapshot"?: NonNullable<Json>,"type"?: Database["public"]['Enums']["booking_type"],"updated_at"?: string,"utm"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: true
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"cancellation_policies": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"name": string,"rules": NonNullable<Json>,"summary": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name": string,"rules": NonNullable<Json>,"summary": NonNullable<Json>,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name"?: string,"rules"?: NonNullable<Json>,"summary"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"consent_records": {
                  Row: {
                    "booking_id": string | null,"created_at": string,"document_version": string,"granted": boolean,"id": string,"inquiry_id": string | null,"ip": unknown,"profile_id": string | null,"purpose": Database["public"]['Enums']["consent_purpose"],"subject_email": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"created_at"?: string,"document_version": string,"granted": boolean,"id"?: string,"inquiry_id"?: string | null,"ip"?: unknown,"profile_id"?: string | null,"purpose": Database["public"]['Enums']["consent_purpose"],"subject_email": string,"user_agent"?: string | null
                  }
                  Update: {
                    "booking_id"?: string | null,"created_at"?: string,"document_version"?: string,"granted"?: boolean,"id"?: string,"inquiry_id"?: string | null,"ip"?: unknown,"profile_id"?: string | null,"purpose"?: Database["public"]['Enums']["consent_purpose"],"subject_email"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"departures": {
                  Row: {
                    "capacity": number,"created_at": string,"end_date": string,"id": string,"note": string | null,"price_adult": number,"price_child": number | null,"price_infant": number | null,"seats_reserved": number,"single_supplement": number | null,"start_date": string,"status": Database["public"]['Enums']["departure_status"],"tour_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"created_at"?: string,"end_date": string,"id"?: string,"note"?: string | null,"price_adult": number,"price_child"?: number | null,"price_infant"?: number | null,"seats_reserved"?: number,"single_supplement"?: number | null,"start_date": string,"status"?: Database["public"]['Enums']["departure_status"],"tour_id": string,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"end_date"?: string,"id"?: string,"note"?: string | null,"price_adult"?: number,"price_child"?: number | null,"price_infant"?: number | null,"seats_reserved"?: number,"single_supplement"?: number | null,"start_date"?: string,"status"?: Database["public"]['Enums']["departure_status"],"tour_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departures_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"destination_translations": {
                  Row: {
                    "best_time_to_visit": string | null,"content": Json | null,"destination_id": string,"id": string,"is_published": boolean,"locale": Database["public"]['Enums']["locale"],"name": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "best_time_to_visit"?: string | null,"content"?: Json | null,"destination_id": string,"id"?: string,"is_published"?: boolean,"locale": Database["public"]['Enums']["locale"],"name": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"summary"?: string | null
                  }
                  Update: {
                    "best_time_to_visit"?: string | null,"content"?: Json | null,"destination_id"?: string,"id"?: string,"is_published"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"name"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "destination_translations_destination_id_fkey"
      columns: ["destination_id"]
isOneToOne: false
      referencedRelation: "destinations"
      referencedColumns: ["id"]
    }
                  ]
                },"destinations": {
                  Row: {
                    "created_at": string,"hero_media_id": string | null,"id": string,"key": string,"latitude": number | null,"longitude": number | null,"parent_id": string | null,"sort_order": number,"status": Database["public"]['Enums']["publish_status"],"type": Database["public"]['Enums']["destination_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hero_media_id"?: string | null,"id"?: string,"key": string,"latitude"?: number | null,"longitude"?: number | null,"parent_id"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["publish_status"],"type": Database["public"]['Enums']["destination_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"hero_media_id"?: string | null,"id"?: string,"key"?: string,"latitude"?: number | null,"longitude"?: number | null,"parent_id"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["publish_status"],"type"?: Database["public"]['Enums']["destination_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "destinations_hero_media_id_fkey"
      columns: ["hero_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destinations_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "destinations"
      referencedColumns: ["id"]
    }
                  ]
                },"email_logs": {
                  Row: {
                    "booking_id": string | null,"created_at": string,"dedupe_key": string | null,"error": string | null,"id": string,"inquiry_id": string | null,"provider_message_id": string | null,"status": string,"subject": string,"template": string,"to_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"inquiry_id"?: string | null,"provider_message_id"?: string | null,"status": string,"subject": string,"template": string,"to_email": string
                  }
                  Update: {
                    "booking_id"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"inquiry_id"?: string | null,"provider_message_id"?: string | null,"status"?: string,"subject"?: string,"template"?: string,"to_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_logs_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_logs_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"inquiries": {
                  Row: {
                    "adults": number | null,"assigned_to": string | null,"budget_per_person": string | null,"children": number,"code": string,"company_name": string | null,"country": string | null,"created_at": string,"destination_ids": (string)[],"destinations_other": string | null,"duration_days": number | null,"email": string,"first_responded_at": string | null,"flexible_dates": boolean,"id": string,"locale": Database["public"]['Enums']["locale"],"message": string | null,"name": string,"phone": string | null,"preferred_contact": string | null,"source": string | null,"status": Database["public"]['Enums']["inquiry_status"],"tour_id": string | null,"travel_month": string | null,"travel_style_id": string | null,"updated_at": string,"utm": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "adults"?: number | null,"assigned_to"?: string | null,"budget_per_person"?: string | null,"children"?: number,"code": string,"company_name"?: string | null,"country"?: string | null,"created_at"?: string,"destination_ids"?: (string)[],"destinations_other"?: string | null,"duration_days"?: number | null,"email": string,"first_responded_at"?: string | null,"flexible_dates"?: boolean,"id"?: string,"locale": Database["public"]['Enums']["locale"],"message"?: string | null,"name": string,"phone"?: string | null,"preferred_contact"?: string | null,"source"?: string | null,"status"?: Database["public"]['Enums']["inquiry_status"],"tour_id"?: string | null,"travel_month"?: string | null,"travel_style_id"?: string | null,"updated_at"?: string,"utm"?: Json | null
                  }
                  Update: {
                    "adults"?: number | null,"assigned_to"?: string | null,"budget_per_person"?: string | null,"children"?: number,"code"?: string,"company_name"?: string | null,"country"?: string | null,"created_at"?: string,"destination_ids"?: (string)[],"destinations_other"?: string | null,"duration_days"?: number | null,"email"?: string,"first_responded_at"?: string | null,"flexible_dates"?: boolean,"id"?: string,"locale"?: Database["public"]['Enums']["locale"],"message"?: string | null,"name"?: string,"phone"?: string | null,"preferred_contact"?: string | null,"source"?: string | null,"status"?: Database["public"]['Enums']["inquiry_status"],"tour_id"?: string | null,"travel_month"?: string | null,"travel_style_id"?: string | null,"updated_at"?: string,"utm"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inquiries_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inquiries_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inquiries_travel_style_id_fkey"
      columns: ["travel_style_id"]
isOneToOne: false
      referencedRelation: "travel_styles"
      referencedColumns: ["id"]
    }
                  ]
                },"internal_notes": {
                  Row: {
                    "author_id": string,"body": string,"booking_id": string | null,"created_at": string,"customer_id": string | null,"id": string,"inquiry_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"booking_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"inquiry_id"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"booking_id"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"inquiry_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "internal_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_notes_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_notes_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "internal_notes_inquiry_id_fkey"
      columns: ["inquiry_id"]
isOneToOne: false
      referencedRelation: "inquiries"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "alt": NonNullable<Json>,"blur_data_url": string | null,"bucket": string,"created_at": string,"created_by": string | null,"credit": string | null,"height": number | null,"id": string,"mime_type": string,"original_name": string | null,"path": string,"size_bytes": number,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: NonNullable<Json>,"blur_data_url"?: string | null,"bucket"?: string,"created_at"?: string,"created_by"?: string | null,"credit"?: string | null,"height"?: number | null,"id"?: string,"mime_type": string,"original_name"?: string | null,"path": string,"size_bytes": number,"width"?: number | null
                  }
                  Update: {
                    "alt"?: NonNullable<Json>,"blur_data_url"?: string | null,"bucket"?: string,"created_at"?: string,"created_by"?: string | null,"credit"?: string | null,"height"?: number | null,"id"?: string,"mime_type"?: string,"original_name"?: string | null,"path"?: string,"size_bytes"?: number,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"page_translations": {
                  Row: {
                    "content": NonNullable<Json>,"id": string,"is_published": boolean,"locale": Database["public"]['Enums']["locale"],"page_id": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"id"?: string,"is_published"?: boolean,"locale": Database["public"]['Enums']["locale"],"page_id": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"title": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"id"?: string,"is_published"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"page_id"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_translations_page_id_fkey"
      columns: ["page_id"]
isOneToOne: false
      referencedRelation: "pages"
      referencedColumns: ["id"]
    }
                  ]
                },"pages": {
                  Row: {
                    "id": string,"key": string,"status": Database["public"]['Enums']["publish_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"key": string,"status"?: Database["public"]['Enums']["publish_status"],"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"key"?: string,"status"?: Database["public"]['Enums']["publish_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_links": {
                  Row: {
                    "amount": number,"booking_id": string,"created_at": string,"created_by": string,"expires_at": string,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"booking_id": string,"created_at"?: string,"created_by": string,"expires_at": string,"id"?: string,"kind": Database["public"]['Enums']["payment_kind"],"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_links_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"booking_id": string,"created_at": string,"currency": string,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"note": string | null,"paid_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_txn_id": string | null,"raw_response": Json | null,"recorded_by": string | null,"reference": string,"status": Database["public"]['Enums']["transaction_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"booking_id": string,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["payment_kind"],"note"?: string | null,"paid_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_txn_id"?: string | null,"raw_response"?: Json | null,"recorded_by"?: string | null,"reference": string,"status"?: Database["public"]['Enums']["transaction_status"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"note"?: string | null,"paid_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_txn_id"?: string | null,"raw_response"?: Json | null,"recorded_by"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["transaction_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"post_categories": {
                  Row: {
                    "id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"post_category_translations": {
                  Row: {
                    "category_id": string,"id": string,"locale": Database["public"]['Enums']["locale"],"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"id"?: string,"locale": Database["public"]['Enums']["locale"],"name": string,"slug": string
                  }
                  Update: {
                    "category_id"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["locale"],"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_category_translations_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "post_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"post_translations": {
                  Row: {
                    "content": NonNullable<Json>,"excerpt": string | null,"id": string,"is_published": boolean,"locale": Database["public"]['Enums']["locale"],"post_id": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"excerpt"?: string | null,"id"?: string,"is_published"?: boolean,"locale": Database["public"]['Enums']["locale"],"post_id": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"title": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"excerpt"?: string | null,"id"?: string,"is_published"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"post_id"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_translations_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "author_id": string | null,"category_id": string | null,"cover_media_id": string | null,"created_at": string,"id": string,"published_at": string | null,"status": Database["public"]['Enums']["publish_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"category_id"?: string | null,"cover_media_id"?: string | null,"created_at"?: string,"id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["publish_status"],"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"category_id"?: string | null,"cover_media_id"?: string | null,"created_at"?: string,"id"?: string,"published_at"?: string | null,"status"?: Database["public"]['Enums']["publish_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "post_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_cover_media_id_fkey"
      columns: ["cover_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"price_tiers": {
                  Row: {
                    "id": string,"max_pax": number,"min_pax": number,"price_per_adult": number,"tour_id": string,"valid_from": string | null,"valid_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"max_pax": number,"min_pax": number,"price_per_adult": number,"tour_id": string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "id"?: string,"max_pax"?: number,"min_pax"?: number,"price_per_adult"?: number,"tour_id"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_tiers_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"country": string | null,"created_at": string,"deleted_at": string | null,"email": string,"full_name": string | null,"id": string,"is_active": boolean,"locale": Database["public"]['Enums']["locale"],"marketing_consent": boolean,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"country"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email": string,"full_name"?: string | null,"id": string,"is_active"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"marketing_consent"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"country"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"email"?: string,"full_name"?: string | null,"id"?: string,"is_active"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"marketing_consent"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"redirects": {
                  Row: {
                    "created_at": string,"from_path": string,"hits": number,"id": string,"status_code": number,"to_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_path": string,"hits"?: number,"id"?: string,"status_code"?: number,"to_path": string
                  }
                  Update: {
                    "created_at"?: string,"from_path"?: string,"hits"?: number,"id"?: string,"status_code"?: number,"to_path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "author_country": string | null,"author_name": string,"booking_id": string | null,"content": string,"created_at": string,"id": string,"is_featured": boolean,"is_verified": boolean,"locale": Database["public"]['Enums']["locale"],"rating": number,"status": Database["public"]['Enums']["review_status"],"title": string | null,"tour_id": string | null,"travel_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_country"?: string | null,"author_name": string,"booking_id"?: string | null,"content": string,"created_at"?: string,"id"?: string,"is_featured"?: boolean,"is_verified"?: boolean,"locale": Database["public"]['Enums']["locale"],"rating": number,"status"?: Database["public"]['Enums']["review_status"],"title"?: string | null,"tour_id"?: string | null,"travel_date"?: string | null
                  }
                  Update: {
                    "author_country"?: string | null,"author_name"?: string,"booking_id"?: string | null,"content"?: string,"created_at"?: string,"id"?: string,"is_featured"?: boolean,"is_verified"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"rating"?: number,"status"?: Database["public"]['Enums']["review_status"],"title"?: string | null,"tour_id"?: string | null,"travel_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "is_public": boolean,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "is_public"?: boolean,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "is_public"?: boolean,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscribers": {
                  Row: {
                    "confirm_token_hash": string | null,"confirmed_at": string | null,"created_at": string,"email": string,"id": string,"locale": Database["public"]['Enums']["locale"],"source": string | null,"unsubscribed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confirm_token_hash"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"locale": Database["public"]['Enums']["locale"],"source"?: string | null,"unsubscribed_at"?: string | null
                  }
                  Update: {
                    "confirm_token_hash"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["locale"],"source"?: string | null,"unsubscribed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"tour_destinations": {
                  Row: {
                    "destination_id": string,"tour_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "destination_id": string,"tour_id": string
                  }
                  Update: {
                    "destination_id"?: string,"tour_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tour_destinations_destination_id_fkey"
      columns: ["destination_id"]
isOneToOne: false
      referencedRelation: "destinations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tour_destinations_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"tour_media": {
                  Row: {
                    "media_id": string,"sort_order": number,"tour_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "media_id": string,"sort_order"?: number,"tour_id": string
                  }
                  Update: {
                    "media_id"?: string,"sort_order"?: number,"tour_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tour_media_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tour_media_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"tour_translations": {
                  Row: {
                    "exclusions": NonNullable<Json>,"faqs": Json | null,"highlights": NonNullable<Json>,"id": string,"inclusions": NonNullable<Json>,"is_published": boolean,"itinerary": NonNullable<Json>,"locale": Database["public"]['Enums']["locale"],"og_media_id": string | null,"practical_info": Json | null,"seo_description": string | null,"seo_title": string | null,"slug": string,"subtitle": string | null,"summary": string,"title": string,"tour_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exclusions"?: NonNullable<Json>,"faqs"?: Json | null,"highlights"?: NonNullable<Json>,"id"?: string,"inclusions"?: NonNullable<Json>,"is_published"?: boolean,"itinerary"?: NonNullable<Json>,"locale": Database["public"]['Enums']["locale"],"og_media_id"?: string | null,"practical_info"?: Json | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"subtitle"?: string | null,"summary": string,"title": string,"tour_id": string
                  }
                  Update: {
                    "exclusions"?: NonNullable<Json>,"faqs"?: Json | null,"highlights"?: NonNullable<Json>,"id"?: string,"inclusions"?: NonNullable<Json>,"is_published"?: boolean,"itinerary"?: NonNullable<Json>,"locale"?: Database["public"]['Enums']["locale"],"og_media_id"?: string | null,"practical_info"?: Json | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"subtitle"?: string | null,"summary"?: string,"title"?: string,"tour_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tour_translations_og_media_id_fkey"
      columns: ["og_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tour_translations_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    }
                  ]
                },"tour_travel_styles": {
                  Row: {
                    "tour_id": string,"travel_style_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "tour_id": string,"travel_style_id": string
                  }
                  Update: {
                    "tour_id"?: string,"travel_style_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tour_travel_styles_tour_id_fkey"
      columns: ["tour_id"]
isOneToOne: false
      referencedRelation: "tours"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tour_travel_styles_travel_style_id_fkey"
      columns: ["travel_style_id"]
isOneToOne: false
      referencedRelation: "travel_styles"
      referencedColumns: ["id"]
    }
                  ]
                },"tours": {
                  Row: {
                    "balance_due_days": number,"cancellation_policy_id": string | null,"child_age_max": number,"code": string,"created_at": string,"currency": string,"deposit_percent": number,"duration_days": number,"duration_nights": number,"from_price": number,"hero_media_id": string | null,"id": string,"infant_age_max": number,"is_featured": boolean,"max_pax": number | null,"min_pax": number,"min_pax_to_operate": number | null,"published_at": string | null,"scope": Database["public"]['Enums']["tour_scope"],"status": Database["public"]['Enums']["publish_status"],"type": Database["public"]['Enums']["tour_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_due_days"?: number,"cancellation_policy_id"?: string | null,"child_age_max"?: number,"code": string,"created_at"?: string,"currency"?: string,"deposit_percent"?: number,"duration_days": number,"duration_nights": number,"from_price": number,"hero_media_id"?: string | null,"id"?: string,"infant_age_max"?: number,"is_featured"?: boolean,"max_pax"?: number | null,"min_pax"?: number,"min_pax_to_operate"?: number | null,"published_at"?: string | null,"scope": Database["public"]['Enums']["tour_scope"],"status"?: Database["public"]['Enums']["publish_status"],"type": Database["public"]['Enums']["tour_type"],"updated_at"?: string
                  }
                  Update: {
                    "balance_due_days"?: number,"cancellation_policy_id"?: string | null,"child_age_max"?: number,"code"?: string,"created_at"?: string,"currency"?: string,"deposit_percent"?: number,"duration_days"?: number,"duration_nights"?: number,"from_price"?: number,"hero_media_id"?: string | null,"id"?: string,"infant_age_max"?: number,"is_featured"?: boolean,"max_pax"?: number | null,"min_pax"?: number,"min_pax_to_operate"?: number | null,"published_at"?: string | null,"scope"?: Database["public"]['Enums']["tour_scope"],"status"?: Database["public"]['Enums']["publish_status"],"type"?: Database["public"]['Enums']["tour_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tours_cancellation_policy_id_fkey"
      columns: ["cancellation_policy_id"]
isOneToOne: false
      referencedRelation: "cancellation_policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tours_hero_media_id_fkey"
      columns: ["hero_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"travel_style_translations": {
                  Row: {
                    "description": string | null,"id": string,"is_published": boolean,"locale": Database["public"]['Enums']["locale"],"name": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"travel_style_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"id"?: string,"is_published"?: boolean,"locale": Database["public"]['Enums']["locale"],"name": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"travel_style_id": string
                  }
                  Update: {
                    "description"?: string | null,"id"?: string,"is_published"?: boolean,"locale"?: Database["public"]['Enums']["locale"],"name"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"travel_style_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "travel_style_translations_travel_style_id_fkey"
      columns: ["travel_style_id"]
isOneToOne: false
      referencedRelation: "travel_styles"
      referencedColumns: ["id"]
    }
                  ]
                },"travel_styles": {
                  Row: {
                    "hero_media_id": string | null,"id": string,"key": string,"sort_order": number,"status": Database["public"]['Enums']["publish_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "hero_media_id"?: string | null,"id"?: string,"key": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["publish_status"]
                  }
                  Update: {
                    "hero_media_id"?: string | null,"id"?: string,"key"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["publish_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "travel_styles_hero_media_id_fkey"
      columns: ["hero_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"travellers": {
                  Row: {
                    "booking_id": string,"date_of_birth": string | null,"dietary_notes": string | null,"full_name": string,"gender": string | null,"id": string,"is_lead": boolean,"nationality": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"date_of_birth"?: string | null,"dietary_notes"?: string | null,"full_name": string,"gender"?: string | null,"id"?: string,"is_lead"?: boolean,"nationality"?: string | null
                  }
                  Update: {
                    "booking_id"?: string,"date_of_birth"?: string | null,"dietary_notes"?: string | null,"full_name"?: string,"gender"?: string | null,"id"?: string,"is_lead"?: boolean,"nationality"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "travellers_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "error": string | null,"event_key": string,"id": string,"payload": NonNullable<Json>,"processed_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"event_key": string,"id"?: string,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"received_at"?: string
                  }
                  Update: {
                    "error"?: string | null,"event_key"?: string,"id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assign_unmatched_transfer":
{ Args: { "event_id": string,"note": string,"target_id": string }; Returns: Json
                           },
"attention_resolvers":
{ Args: { "reason": string }; Returns: (Database["public"]['Enums']["user_role"])[]
                           },
"booking_access_token_state":
{ Args: { "target_code": string,"token_hash": string }; Returns: string
                           },
"booking_checkout_status":
{ Args: { "target_code": string }; Returns: Json
                           },
"booking_cutoff_days":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"booking_prices_current":
{ Args: { "target_id": string }; Returns: boolean
                           },
"can_act_as":
{ Args: { "roles": (Database["public"]['Enums']["user_role"])[] }; Returns: boolean
                           },
"cancel_booking":
{ Args: { "actor": string,"reason": string,"target_id": string }; Returns: Json
                           },
"check_draft_payload":
{ Args: { "payload": Json }; Returns: string
                           },
"check_seat_invariant":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"complete_bookings":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"confirm_newsletter_subscription":
{ Args: { "p_document_version": string,"p_ip"?: unknown,"p_token_hash": string,"p_user_agent"?: string }; Returns: boolean
                           },
"create_checkout_draft":
{ Args: { "ip": unknown,"marketing": boolean,"payload": Json,"privacy_version": string,"terms_version": string,"user_agent": string }; Returns: string
                           },
"create_contact_inquiry":
{ Args: { "p_email": string,"p_ip"?: unknown,"p_locale": Database["public"]['Enums']["locale"],"p_message": string,"p_name": string,"p_phone": string,"p_preferred_contact": string,"p_privacy_version": string,"p_tour_code": string,"p_user_agent"?: string }; Returns: string
                           },
"create_draft_booking":
{ Args: { "payload": Json }; Returns: string
                           },
"create_payment_link":
{ Args: { "target_id": string,"token_hash": string,"valid_hours": number }; Returns: Json
                           },
"create_quote":
{ Args: { "payload": Json }; Returns: string
                           },
"create_redirect":
{ Args: { "source": string,"status"?: number,"target": string }; Returns: string
                           },
"current_user_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"default_cancellation_policy_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"departure_has_open_bookings":
{ Args: { "target_id": string }; Returns: boolean
                           },
"expire_booking_if_due":
{ Args: { "target_id": string }; Returns: boolean
                           },
"expire_holds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"has_role":
{ Args: { "roles": (Database["public"]['Enums']["user_role"])[] }; Returns: boolean
                           },
"hold_minutes":
{ Args: { "provider": Database["public"]['Enums']["payment_provider"] }; Returns: number
                           },
"immutable_unaccent":
{ Args: { "value": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_homepage_hero":
{ Args: { "target_id": string }; Returns: boolean
                           },
"is_mfa_verified":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff_or_trusted":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_cancellation_rules":
{ Args: { "rules": Json }; Returns: boolean
                           },
"is_valid_slug":
{ Args: { "slug": string }; Returns: boolean
                           },
"issue_booking_access_token":
{ Args: { "purpose": string,"target_id": string,"token_hash": string,"valid_minutes": number }; Returns: string
                           },
"itinerary_media_ids":
{ Args: { "itinerary": Json }; Returns: (string)[]
                           },
"lock_tour_row":
{ Args: { "target_id": string }; Returns: undefined
                           },
"log_booking_event":
{ Args: { "actor"?: string,"event_type": string,"from_status": Database["public"]['Enums']["booking_status"],"message"?: string,"target_id": string,"to_status": Database["public"]['Enums']["booking_status"] }; Returns: undefined
                           },
"media_alt_complete":
{ Args: { "media_id": string }; Returns: boolean
                           },
"media_used_in_content":
{ Args: { "target_id": string }; Returns: boolean
                           },
"next_booking_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"next_inquiry_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"payment_link_state":
{ Args: { "token_hash": string }; Returns: string
                           },
"raise_on_email_problems":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"raise_on_seat_mismatch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_manual_payment":
{ Args: { "amount": number,"method": Database["public"]['Enums']["payment_provider"],"note": string,"target_id": string }; Returns: Json
                           },
"record_payment_event":
{ Args: { "amount": number,"event_key": string,"payload": Json,"provider": Database["public"]['Enums']["payment_provider"],"provider_txn_id": string,"reference": string,"succeeded": boolean }; Returns: Json
                           },
"record_refund":
{ Args: { "amount": number,"method": Database["public"]['Enums']["payment_provider"],"note": string,"target_id": string }; Returns: Json
                           },
"record_slug_redirect":
{ Args: { "source": string,"target": string }; Returns: undefined
                           },
"redeem_booking_access_token":
{ Args: { "target_code": string,"token_hash": string }; Returns: Json
                           },
"redeem_payment_link":
{ Args: { "token_hash": string }; Returns: Json
                           },
"refresh_payment_state":
{ Args: { "target_id": string }; Returns: undefined
                           },
"release_seats":
{ Args: { "seats": number,"target_departure": string }; Returns: undefined
                           },
"request_cancellation":
{ Args: { "note": string,"target_id": string }; Returns: undefined
                           },
"request_newsletter_subscription":
{ Args: { "p_email": string,"p_locale": Database["public"]['Enums']["locale"],"p_source": string,"p_token_hash": string }; Returns: boolean
                           },
"require_note":
{ Args: { "note": string }; Returns: string
                           },
"reserve_and_create_payment":
{ Args: { "kind": Database["public"]['Enums']["payment_kind"],"provider": Database["public"]['Enums']["payment_provider"],"target_id": string }; Returns: Json
                           },
"resolve_attention":
{ Args: { "note": string,"target_id": string }; Returns: undefined
                           },
"rich_text_alt_complete":
{ Args: { "doc": Json }; Returns: boolean
                           },
"rich_text_is_empty":
{ Args: { "doc": Json }; Returns: boolean
                           },
"rich_text_media_ids":
{ Args: { "doc": Json }; Returns: (string)[]
                           },
"search_site":
{ Args: { "p_limit"?: number,"p_locale": Database["public"]['Enums']["locale"],"p_q": string }; Returns: {
              "id": string,"kind": string,"published_at": string,"slug": string,"summary": string,"title": string
            }[]
                           },
"search_tours":
{ Args: { "p_destination_ids"?: (string)[],"p_durations"?: (string)[],"p_exclude_ids"?: (string)[],"p_featured_only"?: boolean,"p_limit"?: number,"p_locale": Database["public"]['Enums']["locale"],"p_months"?: (string)[],"p_offset"?: number,"p_price_max"?: number,"p_price_min"?: number,"p_q"?: string,"p_scopes"?: (Database["public"]['Enums']["tour_scope"])[],"p_sort"?: string,"p_travel_style_ids"?: (string)[] }; Returns: {
              "display_price": number,"next_departure_date": string,"other_departure_count": number,"price_source": string,"seats_left_next": number,"total_count": number,"tour_id": string
            }[]
                           },
"set_default_cancellation_policy":
{ Args: { "policy_id": string }; Returns: undefined
                           },
"set_tour_links":
{ Args: { "destination_ids": (string)[],"media_ids": (string)[],"target_id": string,"travel_style_ids": (string)[] }; Returns: undefined
                           },
"staff_cancel_booking":
{ Args: { "reason": string,"target_id": string }; Returns: Json
                           },
"take_seats":
{ Args: { "seats": number,"target_departure": string }; Returns: boolean
                           },
"tour_departures":
{ Args: { "p_limit"?: number,"p_tour_id": string }; Returns: {
              "bookable": boolean,"end_date": string,"id": string,"note": string,"price_adult": number,"price_child": number,"price_infant": number,"seats_left": number,"single_supplement": number,"start_date": string,"status": Database["public"]['Enums']["departure_status"]
            }[]
                           },
"update_draft_booking":
{ Args: { "payload": Json,"target_id": string }; Returns: undefined
                           },
"vietnam_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            "booking_item_type": "adult"|"child"|"infant"|"single_supplement"|"addon"|"discount"|"adjustment","booking_payment_state": "unpaid"|"deposit_paid"|"paid"|"partially_refunded"|"refunded","booking_status": "draft"|"quoted"|"pending_payment"|"confirmed"|"completed"|"cancelled"|"expired","booking_type": "instant"|"quoted","consent_purpose": "terms"|"privacy"|"marketing"|"analytics","departure_status": "open"|"guaranteed"|"closed"|"cancelled","destination_type": "country"|"region"|"city","inquiry_status": "new"|"contacted"|"quoted"|"won"|"lost"|"spam","locale": "vi"|"en","payment_kind": "deposit"|"balance"|"full"|"refund","payment_plan": "deposit"|"full","payment_provider": "vnpay"|"bank_transfer"|"momo"|"onepay"|"paypal"|"cash"|"manual","publish_status": "draft"|"published"|"archived","review_status": "pending"|"approved"|"rejected","tour_scope": "domestic"|"international","tour_type": "group"|"private","transaction_status": "pending"|"succeeded"|"failed"|"expired"|"cancelled","user_role": "customer"|"sales"|"sales_manager"|"operator"|"accountant"|"editor"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_item_type": ["adult", "child", "infant", "single_supplement", "addon", "discount", "adjustment"],"booking_payment_state": ["unpaid", "deposit_paid", "paid", "partially_refunded", "refunded"],"booking_status": ["draft", "quoted", "pending_payment", "confirmed", "completed", "cancelled", "expired"],"booking_type": ["instant", "quoted"],"consent_purpose": ["terms", "privacy", "marketing", "analytics"],"departure_status": ["open", "guaranteed", "closed", "cancelled"],"destination_type": ["country", "region", "city"],"inquiry_status": ["new", "contacted", "quoted", "won", "lost", "spam"],"locale": ["vi", "en"],"payment_kind": ["deposit", "balance", "full", "refund"],"payment_plan": ["deposit", "full"],"payment_provider": ["vnpay", "bank_transfer", "momo", "onepay", "paypal", "cash", "manual"],"publish_status": ["draft", "published", "archived"],"review_status": ["pending", "approved", "rejected"],"tour_scope": ["domestic", "international"],"tour_type": ["group", "private"],"transaction_status": ["pending", "succeeded", "failed", "expired", "cancelled"],"user_role": ["customer", "sales", "sales_manager", "operator", "accountant", "editor", "admin"]
          }
        }
} as const
