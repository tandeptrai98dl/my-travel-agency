-- Development seed data (docs/specs/phase-0-foundation.md step 6). Local and staging only.
-- Everything here is sample content: company details, prices and the cancellation policy are
-- placeholders until the owner provides real values (PROJECT_BRIEF.md §9).
-- Staff and customer accounts are created separately by `npm run seed:users`.

-- Settings ------------------------------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  ('company', '{
    "name": "Premium Travel Agency (sample)",
    "legal_name": null,
    "tax_code": null,
    "tour_operator_licence": null,
    "ecommerce_notification_url": null,
    "address": {"vi": "Địa chỉ văn phòng (mẫu)", "en": "Office address (sample)"}
  }', true),
  ('contact', '{
    "phone": "+84 00 0000 0000",
    "email": "hello@example.com",
    "zalo": null,
    "whatsapp": null,
    "office_hours": {"vi": "Thứ Hai – Thứ Bảy, 8:30–18:00", "en": "Monday to Saturday, 8:30–18:00"}
  }', true),
  ('booking_rules', '{
    "hold_minutes": {"vnpay": 30, "bank_transfer": 120},
    "late_payment": "confirm_if_seats_remain_else_needs_attention",
    "overdue_balance": "remind_and_flag",
    "balance_reminder_days_before_due": [7, 2],
    "max_infants_per_adult": 0.5,
    "infants_take_seat": false,
    "booking_lookup_link_minutes": 30,
    "sales_manager_can_edit_departure_prices": false
  }', false),
  -- Sample receiving account (development and CI only): turns on the VietQR method locally.
  ('bank_account', '{
    "bank_name": "Vietcombank",
    "bank_bin": "970436",
    "account_number": "0011000000000",
    "account_holder": "CONG TY TNHH DU LICH MAU"
  }', false),
  ('homepage', '{
    "hero": {
      "eyebrow": {"vi": "Hành trình riêng tư", "en": "Private journeys"},
      "title": {"vi": "Những chuyến đi được chăm chút từng chi tiết", "en": "Journeys shaped down to the smallest detail"}
    },
    "featured_destination_keys": ["vietnam", "japan", "france"],
    "journal_teaser_count": 3
  }', true);

-- Cancellation policy ------------------------------------------------------------------------
insert into public.cancellation_policies (name, version, rules, summary, is_default) values
  ('Standard (sample)', 1,
   '[{"min_days_before": 30, "refund_percent": 80},
     {"min_days_before": 15, "refund_percent": 50},
     {"min_days_before": 0, "refund_percent": 0}]',
   '{"vi": "Hủy trước 30 ngày: hoàn 80%. Từ 15 đến 29 ngày: hoàn 50%. Dưới 15 ngày: không hoàn tiền.",
     "en": "Cancel 30 or more days before departure: 80% refund. 15 to 29 days: 50%. Under 15 days: no refund."}',
   true);

-- Destinations: 3 countries with regions and cities ---------------------------------------------
insert into public.destinations (key, type, status, latitude, longitude, sort_order) values
  ('vietnam', 'country', 'published', 14.058324, 108.277199, 1),
  ('japan', 'country', 'published', 36.204824, 138.252924, 2),
  ('france', 'country', 'published', 46.227638, 2.213749, 3);

insert into public.destinations (key, type, parent_id, status, latitude, longitude, sort_order)
select v.key, 'region'::public.destination_type, p.id, 'published'::public.publish_status, v.lat, v.lng, v.sort_order
from (values
  ('northern-vietnam', 'vietnam', 21.500000, 105.000000, 1),
  ('central-vietnam', 'vietnam', 16.050000, 108.200000, 2),
  ('southern-vietnam', 'vietnam', 10.500000, 106.500000, 3),
  ('kansai', 'japan', 34.700000, 135.500000, 1),
  ('kanto', 'japan', 35.700000, 139.700000, 2),
  ('ile-de-france', 'france', 48.850000, 2.350000, 1),
  ('provence', 'france', 43.900000, 5.200000, 2)
) as v(key, parent_key, lat, lng, sort_order)
join public.destinations p on p.key = v.parent_key;

insert into public.destinations (key, type, parent_id, status, latitude, longitude, sort_order)
select v.key, 'city'::public.destination_type, p.id, 'published'::public.publish_status, v.lat, v.lng, v.sort_order
from (values
  ('hanoi', 'northern-vietnam', 21.027764, 105.834160, 1),
  ('ha-long-bay', 'northern-vietnam', 20.910051, 107.183902, 2),
  ('sapa', 'northern-vietnam', 22.336400, 103.843800, 3),
  ('hoi-an', 'central-vietnam', 15.880058, 108.338047, 1),
  ('hue', 'central-vietnam', 16.463713, 107.590866, 2),
  ('phu-quoc', 'southern-vietnam', 10.289879, 103.984020, 1),
  ('kyoto', 'kansai', 35.011636, 135.768029, 1),
  ('osaka', 'kansai', 34.693738, 135.502165, 2),
  ('tokyo', 'kanto', 35.676192, 139.650311, 1),
  ('paris', 'ile-de-france', 48.856614, 2.352222, 1),
  ('avignon', 'provence', 43.949317, 4.805528, 1)
) as v(key, parent_key, lat, lng, sort_order)
join public.destinations p on p.key = v.parent_key;

insert into public.destination_translations (destination_id, locale, slug, name, summary, best_time_to_visit, is_published)
select d.id, v.locale::public.locale, v.slug, v.name, v.summary, v.best_time, true
from (values
  ('vietnam', 'vi', 'viet-nam', 'Việt Nam', 'Từ vịnh đá vôi phía Bắc đến những bãi biển phương Nam.', 'Quanh năm, tùy vùng'),
  ('vietnam', 'en', 'vietnam', 'Vietnam', 'From the limestone bays of the north to the beaches of the south.', 'Year-round, depending on the region'),
  ('japan', 'vi', 'nhat-ban', 'Nhật Bản', 'Đền cổ, vườn rêu và ẩm thực theo mùa.', 'Tháng 3–5 và tháng 10–11'),
  ('japan', 'en', 'japan', 'Japan', 'Old temples, moss gardens and seasonal cooking.', 'March to May and October to November'),
  ('france', 'vi', 'phap', 'Pháp', 'Bảo tàng Paris và những cánh đồng oải hương xứ Provence.', 'Tháng 5–9'),
  ('france', 'en', 'france', 'France', 'Paris museums and the lavender fields of Provence.', 'May to September'),
  ('northern-vietnam', 'vi', 'mien-bac', 'Miền Bắc', 'Hà Nội, vịnh Hạ Long và ruộng bậc thang Sa Pa.', 'Tháng 9–11 và tháng 3–5'),
  ('northern-vietnam', 'en', 'northern-vietnam', 'Northern Vietnam', 'Hanoi, Ha Long Bay and the Sapa rice terraces.', 'September to November and March to May'),
  ('central-vietnam', 'vi', 'mien-trung', 'Miền Trung', 'Phố cổ Hội An và kinh thành Huế.', 'Tháng 2–8'),
  ('central-vietnam', 'en', 'central-vietnam', 'Central Vietnam', 'Hoi An old town and the citadel of Hue.', 'February to August'),
  ('southern-vietnam', 'vi', 'mien-nam', 'Miền Nam', 'Sài Gòn sôi động và đảo Phú Quốc.', 'Tháng 11–4'),
  ('southern-vietnam', 'en', 'southern-vietnam', 'Southern Vietnam', 'Lively Saigon and the island of Phu Quoc.', 'November to April'),
  ('kansai', 'vi', 'kansai', 'Kansai', 'Kyoto và Osaka.', 'Tháng 4 và tháng 11'),
  ('kansai', 'en', 'kansai', 'Kansai', 'Kyoto and Osaka.', 'April and November'),
  ('kanto', 'vi', 'kanto', 'Kanto', 'Tokyo và vùng phụ cận.', 'Tháng 3–5 và tháng 10–11'),
  ('kanto', 'en', 'kanto', 'Kanto', 'Tokyo and its surroundings.', 'March to May and October to November'),
  ('ile-de-france', 'vi', 'ile-de-france', 'Île-de-France', 'Paris và Versailles.', 'Tháng 5–9'),
  ('ile-de-france', 'en', 'ile-de-france', 'Île-de-France', 'Paris and Versailles.', 'May to September'),
  ('provence', 'vi', 'provence', 'Provence', 'Làng đá trên đồi và chợ phiên buổi sáng.', 'Tháng 6–7 cho mùa oải hương'),
  ('provence', 'en', 'provence', 'Provence', 'Hilltop villages and morning markets.', 'June to July for the lavender'),
  ('hanoi', 'vi', 'ha-noi', 'Hà Nội', 'Phố cổ, hồ Gươm và cà phê trứng.', 'Tháng 10–12'),
  ('hanoi', 'en', 'hanoi', 'Hanoi', 'The Old Quarter, Hoan Kiem Lake and egg coffee.', 'October to December'),
  ('ha-long-bay', 'vi', 'vinh-ha-long', 'Vịnh Hạ Long', 'Gần hai nghìn đảo đá vôi trên mặt nước ngọc bích.', 'Tháng 3–5 và tháng 9–11'),
  ('ha-long-bay', 'en', 'ha-long-bay', 'Ha Long Bay', 'Nearly two thousand limestone islands on jade water.', 'March to May and September to November'),
  ('sapa', 'vi', 'sa-pa', 'Sa Pa', 'Ruộng bậc thang và bản làng vùng cao.', 'Tháng 9–10'),
  ('sapa', 'en', 'sapa', 'Sapa', 'Rice terraces and highland villages.', 'September to October'),
  ('hoi-an', 'vi', 'hoi-an', 'Hội An', 'Phố đèn lồng bên sông Hoài.', 'Tháng 2–4'),
  ('hoi-an', 'en', 'hoi-an', 'Hoi An', 'A lantern-lit town on the Thu Bon river.', 'February to April'),
  ('hue', 'vi', 'hue', 'Huế', 'Kinh thành, lăng tẩm và ẩm thực cung đình.', 'Tháng 1–4'),
  ('hue', 'en', 'hue', 'Hue', 'The citadel, royal tombs and imperial cooking.', 'January to April'),
  ('phu-quoc', 'vi', 'phu-quoc', 'Phú Quốc', 'Hoàng hôn trên biển và rừng nguyên sinh.', 'Tháng 11–4'),
  ('phu-quoc', 'en', 'phu-quoc', 'Phu Quoc', 'Sunsets over the sea and old-growth forest.', 'November to April'),
  ('kyoto', 'vi', 'kyoto', 'Kyoto', 'Hơn một nghìn ngôi đền và vườn thiền.', 'Tháng 4 và tháng 11'),
  ('kyoto', 'en', 'kyoto', 'Kyoto', 'More than a thousand temples and Zen gardens.', 'April and November'),
  ('osaka', 'vi', 'osaka', 'Osaka', 'Thủ phủ ẩm thực đường phố của Nhật.', 'Tháng 3–5'),
  ('osaka', 'en', 'osaka', 'Osaka', 'The street-food capital of Japan.', 'March to May'),
  ('tokyo', 'vi', 'tokyo', 'Tokyo', 'Đô thị hiện đại bên những khu vườn yên tĩnh.', 'Tháng 3–5 và tháng 10–11'),
  ('tokyo', 'en', 'tokyo', 'Tokyo', 'A modern city around quiet gardens.', 'March to May and October to November'),
  ('paris', 'vi', 'paris', 'Paris', 'Bảo tàng, đại lộ và những quán cà phê vỉa hè.', 'Tháng 5–6 và tháng 9'),
  ('paris', 'en', 'paris', 'Paris', 'Museums, boulevards and pavement cafés.', 'May to June and September'),
  ('avignon', 'vi', 'avignon', 'Avignon', 'Cung điện Giáo hoàng bên sông Rhône.', 'Tháng 6–9'),
  ('avignon', 'en', 'avignon', 'Avignon', 'The Palace of the Popes on the Rhône.', 'June to September')
) as v(key, locale, slug, name, summary, best_time)
join public.destinations d on d.key = v.key;

-- Travel styles ------------------------------------------------------------------------------
insert into public.travel_styles (key, status, sort_order) values
  ('honeymoon', 'published', 1),
  ('family', 'published', 2),
  ('wellness', 'published', 3),
  ('culture', 'published', 4);

insert into public.travel_style_translations (travel_style_id, locale, slug, name, description, is_published)
select s.id, v.locale::public.locale, v.slug, v.name, v.description, true
from (values
  ('honeymoon', 'vi', 'trang-mat', 'Trăng mật', 'Những chuyến đi riêng tư cho hai người.'),
  ('honeymoon', 'en', 'honeymoon', 'Honeymoon', 'Private journeys for two.'),
  ('family', 'vi', 'gia-dinh', 'Gia đình', 'Nhịp độ thoải mái cho mọi lứa tuổi.'),
  ('family', 'en', 'family', 'Family', 'An easy pace for every age.'),
  ('wellness', 'vi', 'nghi-duong', 'Nghỉ dưỡng', 'Spa, yoga và những buổi sáng chậm rãi.'),
  ('wellness', 'en', 'wellness', 'Wellness', 'Spa, yoga and slow mornings.'),
  ('culture', 'vi', 'van-hoa', 'Văn hóa', 'Di sản, nghệ nhân và ẩm thực địa phương.'),
  ('culture', 'en', 'culture', 'Culture', 'Heritage, artisans and local food.')
) as v(key, locale, slug, name, description)
join public.travel_styles s on s.key = v.key;

-- Tours: group and private, domestic and international; one draft; one without a published EN
-- translation. Prices are integer dong.
insert into public.tours (
  code, type, scope, status, duration_days, duration_nights, min_pax, max_pax, min_pax_to_operate,
  from_price, deposit_percent, balance_due_days, is_featured, cancellation_policy_id, published_at
)
-- Inserted as drafts; the ones marked published are published at the end of this file, once they
-- have translations, departures and a hero image (the publish rules apply to the seed too).
select v.code, v.type::public.tour_type, v.scope::public.tour_scope, 'draft'::public.publish_status,
       v.days, v.nights, v.min_pax, v.max_pax, v.min_operate, v.from_price, 30, 30, v.featured,
       (select id from public.cancellation_policies where is_default limit 1),
       null
from (values
  ('VN-HLB-03', 'group', 'domestic', 'published', 3, 2, 1, 16, 6, 12900000::bigint, true),
  ('VN-NTH-06', 'group', 'domestic', 'published', 6, 5, 1, 14, 6, 24500000::bigint, true),
  ('VN-HER-05', 'private', 'domestic', 'published', 5, 4, 2, 10, null, 18900000::bigint, false),
  ('JP-KYT-07', 'group', 'international', 'published', 7, 6, 1, 12, 8, 68000000::bigint, true),
  ('FR-PRV-09', 'private', 'international', 'published', 9, 8, 2, 8, null, 135000000::bigint, false),
  ('VN-PQC-04', 'group', 'domestic', 'draft', 4, 3, 1, 12, 4, 15800000::bigint, false)
) as v(code, type, scope, status, days, nights, min_pax, max_pax, min_operate, from_price, featured);

insert into public.tour_translations (
  tour_id, locale, slug, title, subtitle, summary, highlights, itinerary, inclusions, exclusions,
  seo_title, seo_description, is_published
)
select t.id, v.locale::public.locale, v.slug, v.title, v.subtitle, v.summary, v.highlights::jsonb,
       v.itinerary::jsonb, v.inclusions::jsonb, v.exclusions::jsonb, v.title, v.summary, v.published
from (values
  ('VN-HLB-03', 'vi', 'du-thuyen-vinh-ha-long', 'Du thuyền vịnh Hạ Long', '3 ngày trên vịnh Lan Hạ',
   'Hai đêm trên du thuyền nhỏ, chèo kayak qua hang Sáng Tối và bữa tối trên boong khi hoàng hôn.',
   '["Du thuyền 10 cabin", "Chèo kayak hang Sáng Tối", "Lớp nấu ăn trên boong"]',
   '[{"day": 1, "title": "Hà Nội – vịnh Lan Hạ", "description": "Xe riêng đến cảng Tuần Châu, lên thuyền và dùng bữa trưa.", "meals": ["lunch", "dinner"], "accommodation": "Du thuyền"},
     {"day": 2, "title": "Hang Sáng Tối", "description": "Chèo kayak buổi sáng, chiều tự do trên boong.", "meals": ["breakfast", "lunch", "dinner"], "accommodation": "Du thuyền"},
     {"day": 3, "title": "Về Hà Nội", "description": "Tập thái cực quyền lúc bình minh, trả cabin và về Hà Nội.", "meals": ["breakfast", "lunch"], "accommodation": null}]',
   '["Xe riêng Hà Nội – cảng", "Cabin hướng biển", "Các bữa ăn theo chương trình"]',
   '["Đồ uống", "Chi phí cá nhân"]', true),
  ('VN-HLB-03', 'en', 'ha-long-bay-cruise', 'Ha Long Bay Cruise', '3 days on Lan Ha Bay',
   'Two nights on a small ship, kayaking through Sang Toi cave and dinner on deck at sunset.',
   '["A 10-cabin ship", "Kayaking Sang Toi cave", "Cooking class on deck"]',
   '[{"day": 1, "title": "Hanoi to Lan Ha Bay", "description": "Private transfer to Tuan Chau harbour, boarding and lunch.", "meals": ["lunch", "dinner"], "accommodation": "Cruise ship"},
     {"day": 2, "title": "Sang Toi cave", "description": "Morning kayaking, a free afternoon on deck.", "meals": ["breakfast", "lunch", "dinner"], "accommodation": "Cruise ship"},
     {"day": 3, "title": "Back to Hanoi", "description": "Tai chi at sunrise, check-out and return to Hanoi.", "meals": ["breakfast", "lunch"], "accommodation": null}]',
   '["Private Hanoi–harbour transfer", "Sea-view cabin", "Meals as listed"]',
   '["Drinks", "Personal expenses"]', true),
  ('VN-NTH-06', 'vi', 'ha-noi-sa-pa-ha-long', 'Hà Nội – Sa Pa – Hạ Long', '6 ngày miền Bắc',
   'Phố cổ Hà Nội, hai đêm giữa ruộng bậc thang Sa Pa và một đêm trên vịnh Hạ Long.',
   '["Đi bộ bản Tả Van", "Ẩm thực phố cổ", "Một đêm trên vịnh"]',
   '[{"day": 1, "title": "Hà Nội", "description": "Đón sân bay, tối dạo phố cổ.", "meals": ["dinner"], "accommodation": "Khách sạn Hà Nội"},
     {"day": 2, "title": "Lên Sa Pa", "description": "Tàu đêm hoặc xe riêng lên Sa Pa.", "meals": ["breakfast", "dinner"], "accommodation": "Khu nghỉ dưỡng Sa Pa"}]',
   '["Khách sạn 5 sao", "Hướng dẫn viên tiếng Việt hoặc tiếng Anh"]', '["Vé máy bay quốc tế"]', true),
  ('VN-NTH-06', 'en', 'hanoi-sapa-ha-long', 'Hanoi, Sapa and Ha Long', '6 days in the north',
   'Hanoi Old Quarter, two nights among the Sapa rice terraces and a night on Ha Long Bay.',
   '["Walking to Ta Van village", "Old Quarter food", "A night on the bay"]',
   '[{"day": 1, "title": "Hanoi", "description": "Airport pick-up, an evening walk through the Old Quarter.", "meals": ["dinner"], "accommodation": "Hotel in Hanoi"},
     {"day": 2, "title": "Up to Sapa", "description": "Night train or private car to Sapa.", "meals": ["breakfast", "dinner"], "accommodation": "Resort in Sapa"}]',
   '["5-star hotels", "Vietnamese- or English-speaking guide"]', '["International flights"]', true),
  ('VN-HER-05', 'vi', 'di-san-hoi-an-hue', 'Di sản Hội An và Huế', 'Hành trình riêng 5 ngày',
   'Thiết kế riêng cho gia đình hoặc nhóm bạn: phố cổ Hội An, làng gốm Thanh Hà và kinh thành Huế.',
   '["Hướng dẫn viên riêng", "Thuyền đèn lồng sông Hoài", "Bữa tối cung đình"]',
   '[{"day": 1, "title": "Đà Nẵng – Hội An", "description": "Đón sân bay, chiều đạp xe qua làng rau Trà Quế.", "meals": ["dinner"], "accommodation": "Khu nghỉ dưỡng Hội An"}]',
   '["Xe và hướng dẫn viên riêng"]', '["Vé máy bay"]', true),
  ('VN-HER-05', 'en', 'hoi-an-hue-heritage', 'Hoi An and Hue Heritage', 'A private 5-day journey',
   'Tailored for families or friends: Hoi An old town, Thanh Ha pottery village and the Hue citadel.',
   '["Private guide", "Lantern boat on the river", "Imperial dinner"]',
   '[{"day": 1, "title": "Da Nang to Hoi An", "description": "Airport pick-up, an afternoon cycle through Tra Que village.", "meals": ["dinner"], "accommodation": "Resort in Hoi An"}]',
   '["Private car and guide"]', '["Flights"]', true),
  ('JP-KYT-07', 'vi', 'kyoto-tokyo-mua-thu', 'Kyoto và Tokyo mùa lá đỏ', '7 ngày Nhật Bản',
   'Vườn thiền Kyoto, một đêm ở ryokan có suối nước nóng và tàu Shinkansen đến Tokyo.',
   '["Đêm ở ryokan", "Trà đạo riêng", "Tàu Shinkansen"]',
   '[{"day": 1, "title": "Đến Osaka", "description": "Đón sân bay Kansai, nhận phòng tại Kyoto.", "meals": ["dinner"], "accommodation": "Khách sạn Kyoto"}]',
   '["Vé máy bay khứ hồi", "Visa Nhật Bản", "Khách sạn 5 sao và một đêm ryokan"]', '["Chi phí cá nhân"]', true),
  ('JP-KYT-07', 'en', 'kyoto-tokyo-autumn', 'Kyoto and Tokyo in Autumn', '7 days in Japan',
   'Kyoto Zen gardens, a night at a hot-spring ryokan and the Shinkansen to Tokyo.',
   '["A night at a ryokan", "Private tea ceremony", "Shinkansen"]',
   '[{"day": 1, "title": "Arrive in Osaka", "description": "Kansai airport pick-up, check-in in Kyoto.", "meals": ["dinner"], "accommodation": "Hotel in Kyoto"}]',
   '["Return flights", "Japan visa", "5-star hotels and one ryokan night"]', '["Personal expenses"]', false),
  ('FR-PRV-09', 'vi', 'paris-va-provence', 'Paris và Provence', 'Hành trình riêng 9 ngày',
   'Bốn đêm ở Paris, tàu TGV xuống Avignon và những ngày chậm rãi giữa các làng đá Provence.',
   '["Tham quan Louvre riêng", "Nếm rượu Châteauneuf-du-Pape", "Chợ phiên Provence"]',
   '[{"day": 1, "title": "Đến Paris", "description": "Đón sân bay, tối du thuyền sông Seine.", "meals": ["dinner"], "accommodation": "Khách sạn Paris"}]',
   '["Xe và hướng dẫn viên riêng", "Vé tàu TGV hạng nhất"]', '["Vé máy bay", "Visa Schengen"]', true),
  ('FR-PRV-09', 'en', 'paris-and-provence', 'Paris and Provence', 'A private 9-day journey',
   'Four nights in Paris, the TGV to Avignon and slow days among the stone villages of Provence.',
   '["Private Louvre visit", "Châteauneuf-du-Pape tasting", "Provence markets"]',
   '[{"day": 1, "title": "Arrive in Paris", "description": "Airport pick-up, an evening cruise on the Seine.", "meals": ["dinner"], "accommodation": "Hotel in Paris"}]',
   '["Private car and guide", "First-class TGV tickets"]', '["Flights", "Schengen visa"]', true),
  ('VN-PQC-04', 'vi', 'nghi-duong-phu-quoc', 'Nghỉ dưỡng Phú Quốc', '4 ngày bên biển',
   'Bản nháp: spa, yoga buổi sáng và hoàng hôn ở mũi Gành Dầu.',
   '[]', '[]', '[]', '[]', false),
  ('VN-PQC-04', 'en', 'phu-quoc-wellness', 'Phu Quoc Wellness', '4 days by the sea',
   'Draft: spa, morning yoga and sunset at Ganh Dau cape.',
   '[]', '[]', '[]', '[]', false)
) as v(code, locale, slug, title, subtitle, summary, highlights, itinerary, inclusions, exclusions, published)
join public.tours t on t.code = v.code;

insert into public.tour_destinations (tour_id, destination_id)
select t.id, d.id
from (values
  ('VN-HLB-03', 'ha-long-bay'),
  ('VN-NTH-06', 'hanoi'), ('VN-NTH-06', 'sapa'), ('VN-NTH-06', 'ha-long-bay'),
  ('VN-HER-05', 'hoi-an'), ('VN-HER-05', 'hue'),
  ('JP-KYT-07', 'kyoto'), ('JP-KYT-07', 'osaka'), ('JP-KYT-07', 'tokyo'),
  ('FR-PRV-09', 'paris'), ('FR-PRV-09', 'avignon'),
  ('VN-PQC-04', 'phu-quoc')
) as v(code, key)
join public.tours t on t.code = v.code
join public.destinations d on d.key = v.key;

insert into public.tour_travel_styles (tour_id, travel_style_id)
select t.id, s.id
from (values
  ('VN-HLB-03', 'honeymoon'), ('VN-NTH-06', 'culture'), ('VN-HER-05', 'family'),
  ('VN-HER-05', 'culture'), ('JP-KYT-07', 'culture'), ('FR-PRV-09', 'honeymoon'),
  ('VN-PQC-04', 'wellness')
) as v(code, key)
join public.tours t on t.code = v.code
join public.travel_styles s on s.key = v.key;

-- Indicative group-size pricing for the private tours.
insert into public.price_tiers (tour_id, min_pax, max_pax, price_per_adult)
select t.id, v.min_pax, v.max_pax, v.price
from (values
  ('VN-HER-05', 2, 3, 24900000::bigint), ('VN-HER-05', 4, 6, 20900000::bigint), ('VN-HER-05', 7, 10, 18900000::bigint),
  ('FR-PRV-09', 2, 3, 159000000::bigint), ('FR-PRV-09', 4, 8, 135000000::bigint)
) as v(code, min_pax, max_pax, price)
join public.tours t on t.code = v.code;

-- Departures every two weeks for the next six months (day 14 to day 182) (group tours only). Child price 75% of the
-- adult price, infants 10%; a few departures are guaranteed or closed to exercise the UI states.
insert into public.departures (
  tour_id, start_date, end_date, capacity, status, price_adult, price_child, price_infant, single_supplement
)
select t.id,
       d.start_date,
       d.start_date + (t.duration_days - 1),
       t.max_pax,
       case
         when d.n = 2 then 'guaranteed'::public.departure_status
         when d.n = 5 then 'closed'::public.departure_status
         else 'open'::public.departure_status
       end,
       t.from_price + (d.n % 3) * 1000000,
       (t.from_price + (d.n % 3) * 1000000) * 3 / 4,
       (t.from_price + (d.n % 3) * 1000000) / 10,
       t.from_price / 4
from public.tours t
cross join lateral (
  select (current_date + 14 + (g * 14))::date as start_date, g as n
  from generate_series(0, 12) as g
) d
where t.type = 'group';

-- Hero images for the sample tours. Rows only (credit 'Sample image'): SQL cannot upload files, so
-- pages show an empty frame until `npm run seed:media` uploads generated placeholders for these rows,
-- or `npm run seed:media -- --photos` free Unsplash photos (scripts/lib/seed-photos.ts maps each
-- row by its seed text, so keep that map in step when adding sample rows; a unit test checks it).
-- Real photos replace them through /admin/media. Ids are deterministic version-4 UUIDs (the admin
-- validates ids as RFC 9562 UUIDs).
create function pg_temp.seed_uuid(seed text)
returns uuid
language sql
immutable
as $$
  select (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8'
          || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid
  from (select md5(seed) as h) as m
$$;

insert into public.media (id, path, mime_type, width, height, size_bytes, alt, credit)
select pg_temp.seed_uuid('seed-media-' || t.code),
       '2026/01/' || pg_temp.seed_uuid('seed-media-' || t.code) || '.jpg',
       'image/jpeg', 2400, 1600, 850000,
       jsonb_build_object('vi', vi.title, 'en', coalesce(en.title, vi.title)),
       'Sample image'
from public.tours t
join public.tour_translations vi on vi.tour_id = t.id and vi.locale = 'vi'
left join public.tour_translations en on en.tour_id = t.id and en.locale = 'en';

update public.tours t
set hero_media_id = pg_temp.seed_uuid('seed-media-' || t.code);

update public.tours
set status = 'published', published_at = now()
where code in ('VN-HLB-03', 'VN-NTH-06', 'VN-HER-05', 'JP-KYT-07', 'FR-PRV-09');

-- ============================================================================================
-- Phase 3 PR K: sample journal, pages and reviews (development only)
-- ============================================================================================

-- Journal covers (rows only, like the tour heroes; files from `npm run seed:media [-- --photos]`).
insert into public.media (id, path, mime_type, width, height, size_bytes, alt, credit)
select pg_temp.seed_uuid('seed-post-' || v.key),
       '2026/01/' || pg_temp.seed_uuid('seed-post-' || v.key) || '.jpg',
       'image/jpeg', 2400, 1600, 700000,
       jsonb_build_object('vi', v.alt_vi, 'en', v.alt_en),
       'Sample image'
from (values
  ('ha-long', 'Thuyền gỗ giữa những đảo đá vôi lúc bình minh', 'A wooden boat among limestone islands at dawn'),
  ('kyoto', 'Lá phong đỏ trên mái chùa ở Kyoto', 'Red maple leaves over a temple roof in Kyoto'),
  ('provence', 'Cánh đồng oải hương xứ Provence', 'A lavender field in Provence')
) as v(key, alt_vi, alt_en);

insert into public.post_categories (id, sort_order) values
  (pg_temp.seed_uuid('seed-topic-guides'), 1),
  (pg_temp.seed_uuid('seed-topic-inspiration'), 2);

insert into public.post_category_translations (category_id, locale, slug, name) values
  (pg_temp.seed_uuid('seed-topic-guides'), 'vi', 'cam-nang', 'Cẩm nang'),
  (pg_temp.seed_uuid('seed-topic-guides'), 'en', 'guides', 'Guides'),
  (pg_temp.seed_uuid('seed-topic-inspiration'), 'vi', 'cam-hung', 'Cảm hứng'),
  (pg_temp.seed_uuid('seed-topic-inspiration'), 'en', 'inspiration', 'Inspiration');

insert into public.posts (id, status, category_id, cover_media_id, published_at) values
  (pg_temp.seed_uuid('seed-post-ha-long'), 'draft', pg_temp.seed_uuid('seed-topic-guides'), pg_temp.seed_uuid('seed-post-ha-long'), null),
  (pg_temp.seed_uuid('seed-post-kyoto'), 'draft', pg_temp.seed_uuid('seed-topic-inspiration'), pg_temp.seed_uuid('seed-post-kyoto'), null),
  (pg_temp.seed_uuid('seed-post-provence'), 'draft', pg_temp.seed_uuid('seed-topic-inspiration'), pg_temp.seed_uuid('seed-post-provence'), null);

insert into public.post_translations (post_id, locale, slug, title, excerpt, content, seo_description, is_published)
select pg_temp.seed_uuid('seed-post-' || v.key), v.locale::public.locale, v.slug, v.title, v.excerpt,
       jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v.excerpt))),
         jsonb_build_object('type', 'heading', 'attrs', jsonb_build_object('level', 2), 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v.heading))),
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v.body)))
       )),
       v.excerpt, v.published
from (values
  ('ha-long', 'vi', 'mot-ngay-tren-vinh-lan-ha', 'Một ngày trên vịnh Lan Hạ', 'Từ bình minh trên boong đến bữa tối dưới trời sao: nhịp một ngày trên du thuyền nhỏ.', 'Buổi sáng', 'Thái cực quyền trên boong, rồi chèo kayak qua những hang đá khi mặt nước còn phẳng lặng.', true),
  ('ha-long', 'en', 'a-day-on-lan-ha-bay', 'A day on Lan Ha Bay', 'From sunrise on deck to dinner under the stars: the rhythm of a day on a small ship.', 'Morning', 'Tai chi on deck, then kayaking through the caves while the water is still flat.', true),
  ('kyoto', 'vi', 'kyoto-mua-la-do', 'Kyoto mùa lá đỏ', 'Những khu vườn nên đến sớm và những con phố nên đi bộ vào buổi chiều.', 'Đến sớm', 'Vườn rêu mở cửa lúc tám giờ; hãy đặt chỗ trước và đến trước khi đoàn khách tới.', true),
  ('kyoto', 'en', 'kyoto-in-autumn', 'Kyoto in autumn', 'The gardens to visit early and the streets to walk in the afternoon.', 'Go early', 'The moss garden opens at eight; book ahead and arrive before the groups.', false),
  ('provence', 'vi', 'provence-mua-oai-huong', 'Provence mùa oải hương', 'Khi nào hoa nở rộ, và những ngôi làng trên đồi đáng ghé qua.', 'Thời điểm', 'Hoa nở đẹp nhất từ cuối tháng Sáu đến giữa tháng Bảy.', true),
  ('provence', 'en', 'provence-in-lavender-season', 'Provence in lavender season', 'When the fields are in full bloom, and the hilltop villages worth a stop.', 'When to go', 'The fields are at their best from late June to mid-July.', true)
) as v(key, locale, slug, title, excerpt, heading, body, published);

update public.posts set status = 'published', published_at = now() - (interval '1 day' * v.days_ago)
from (values ('ha-long', 1), ('kyoto', 3), ('provence', 6)) as v(key, days_ago)
where id = pg_temp.seed_uuid('seed-post-' || v.key);

-- Static pages: about, FAQ and privacy in both languages; cancellation in Vietnamese only;
-- payment stays a draft (left out of the footer). Terms has no row: the content admin E2E
-- creates it.
insert into public.pages (id, key, status) values
  (pg_temp.seed_uuid('seed-page-about'), 'about', 'draft'),
  (pg_temp.seed_uuid('seed-page-faq'), 'faq', 'draft'),
  (pg_temp.seed_uuid('seed-page-privacy'), 'privacy', 'draft'),
  (pg_temp.seed_uuid('seed-page-cancellation'), 'cancellation', 'draft'),
  (pg_temp.seed_uuid('seed-page-payment'), 'payment', 'draft');

insert into public.page_translations (page_id, locale, slug, title, content, seo_description, is_published)
select pg_temp.seed_uuid('seed-page-' || v.key), v.locale::public.locale, v.slug, v.title, v.content::jsonb, v.description, v.published
from (values
  ('about', 'vi', 've-chung-toi', 'Về chúng tôi',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Chúng tôi thiết kế những hành trình riêng tư và nhóm nhỏ, chăm chút từng chi tiết. (Nội dung mẫu.)"}]}]}',
   'Câu chuyện, đội ngũ và giấy phép của chúng tôi.', true),
  ('about', 'en', 'about', 'About us',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We design private and small-group journeys, down to the smallest detail. (Sample content.)"}]}]}',
   'Our story, our team and our licences.', true),
  ('faq', 'vi', 'cau-hoi-thuong-gap', 'Câu hỏi thường gặp',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tôi cần đặt cọc bao nhiêu?"}]},{"type":"paragraph","content":[{"type":"text","text":"Đặt cọc 30% khi xác nhận, phần còn lại trước ngày khởi hành 30 ngày."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Tôi có thể đổi ngày khởi hành không?"}]},{"type":"paragraph","content":[{"type":"text","text":"Có, nếu còn chỗ ở ngày mới; hãy liên hệ chuyên viên tư vấn."}]}]}',
   'Đặt cọc, đổi ngày và những câu hỏi khác.', true),
  ('faq', 'en', 'faq', 'Frequently asked questions',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"How much is the deposit?"}]},{"type":"paragraph","content":[{"type":"text","text":"A 30% deposit on confirmation, the balance 30 days before departure."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Can I change my departure date?"}]},{"type":"paragraph","content":[{"type":"text","text":"Yes, if the new date has seats; please contact a travel designer."}]}]}',
   'Deposits, date changes and other questions.', true),
  ('privacy', 'vi', 'chinh-sach-bao-mat', 'Chính sách bảo mật',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Chính sách mẫu, chờ nội dung pháp lý chính thức."}]}]}', 'Cách chúng tôi thu thập và bảo vệ dữ liệu cá nhân.', true),
  ('privacy', 'en', 'privacy-policy', 'Privacy policy',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Sample policy, awaiting the final legal text."}]}]}', 'How we collect and protect personal data.', true),
  ('cancellation', 'vi', 'chinh-sach-huy', 'Chính sách hủy',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hủy trước 30 ngày: hoàn 80%. (Mẫu.)"}]}]}', 'Mức hoàn tiền theo thời điểm hủy.', true),
  ('payment', 'vi', 'thanh-toan', 'Thanh toán',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Nội dung mẫu."}]}]}', 'Phương thức thanh toán.', false)
) as v(key, locale, slug, title, content, description, published);

update public.pages set status = 'published' where key in ('about', 'faq', 'privacy', 'cancellation');

-- Reviews written in by staff: approved ones are public, featured ones appear on the homepage.
insert into public.reviews (tour_id, author_name, author_country, rating, title, content, locale, travel_date, status, is_featured)
select t.id, v.author, v.country, v.rating, v.title, v.content, v.locale::public.locale, (current_date - v.days_ago)::date,
       v.status::public.review_status, v.featured
from (values
  ('VN-HLB-03', 'Minh Anh', 'Việt Nam', 5, 'Một đêm yên tĩnh trên vịnh', 'Thuyền nhỏ, phòng sạch và bữa tối trên boong rất ngon.', 'vi', 40, 'approved', true),
  ('VN-HER-05', 'Anna', 'United Kingdom', 5, null, 'Every detail was thought through, from the private boat to dinner in a family home.', 'en', 60, 'approved', true),
  ('JP-KYT-07', 'Hoàng', 'Việt Nam', 4, 'Kyoto mùa thu', 'Lịch trình hợp lý, hướng dẫn viên am hiểu.', 'vi', 80, 'approved', false),
  ('VN-HLB-03', 'Pending Reviewer', null, 3, null, 'Not yet moderated.', 'en', 20, 'pending', false)
) as v(code, author, country, rating, title, content, locale, days_ago, status, featured)
join public.tours t on t.code = v.code;

-- ============================================================================================
-- Phase 3 PR L: listing sample (docs/specs/tour-listing.md §3; development only)
-- ============================================================================================
-- 26 more published tours (31 in Vietnamese, 3 pages): Thailand and France, group and private,
-- all duration buckets, 15–298 million dong, departures over 12 months with closed, within-cutoff
-- and few-seats cases. None is featured and none uses Vietnam, Japan, honeymoon or
-- wellness, so the homepage and destination E2E keep their numbers. FR-PAR-07 has no English.

insert into public.destinations (key, type, status, latitude, longitude, sort_order) values
  ('thailand', 'country', 'published', 15.870032, 100.992541, 4);
insert into public.destinations (key, type, parent_id, status, latitude, longitude, sort_order)
select v.key, v.type::public.destination_type, p.id, 'published'::public.publish_status, v.lat, v.lng, v.sort_order
from (values
  ('northern-thailand', 'region', 'thailand', 18.800000, 98.950000, 1),
  ('central-thailand', 'region', 'thailand', 13.750000, 100.500000, 2)
) as v(key, type, parent_key, lat, lng, sort_order)
join public.destinations p on p.key = v.parent_key;
insert into public.destinations (key, type, parent_id, status, latitude, longitude, sort_order)
select v.key, 'city'::public.destination_type, p.id, 'published'::public.publish_status, v.lat, v.lng, v.sort_order
from (values
  ('chiang-mai', 'northern-thailand', 18.788344, 98.985300, 1),
  ('bangkok', 'central-thailand', 13.756331, 100.501765, 1)
) as v(key, parent_key, lat, lng, sort_order)
join public.destinations p on p.key = v.parent_key;
insert into public.destination_translations (destination_id, locale, slug, name, summary, best_time_to_visit, is_published)
select d.id, v.locale::public.locale, v.slug, v.name, v.summary, v.best_time, true
from (values
  ('thailand', 'vi', 'thai-lan', 'Thái Lan', 'Chùa vàng, chợ nổi và rừng núi phương Bắc.', 'Tháng 11–3'),
  ('thailand', 'en', 'thailand', 'Thailand', 'Golden temples, floating markets and northern hills.', 'November to March'),
  ('northern-thailand', 'vi', 'bac-thai-lan', 'Bắc Thái Lan', 'Núi rừng và những ngôi chùa trên đỉnh.', 'Tháng 11–2'),
  ('northern-thailand', 'en', 'northern-thailand', 'Northern Thailand', 'Hills, forests and mountain-top temples.', 'November to February'),
  ('central-thailand', 'vi', 'mien-trung-thai-lan', 'Miền Trung Thái Lan', 'Bangkok và cố đô Ayutthaya.', 'Tháng 11–3'),
  ('central-thailand', 'en', 'central-thailand', 'Central Thailand', 'Bangkok and old Ayutthaya.', 'November to March'),
  ('chiang-mai', 'vi', 'chiang-mai', 'Chiang Mai', 'Phố cổ trong tường thành và chợ đêm.', 'Tháng 11–2'),
  ('chiang-mai', 'en', 'chiang-mai', 'Chiang Mai', 'A walled old town and night markets.', 'November to February'),
  ('bangkok', 'vi', 'bangkok', 'Bangkok', 'Đền chùa bên sông Chao Phraya.', 'Tháng 11–3'),
  ('bangkok', 'en', 'bangkok', 'Bangkok', 'Temples on the Chao Phraya river.', 'November to March')
) as v(key, locale, slug, name, summary, best_time)
join public.destinations d on d.key = v.key;

create temporary table listing_seed (code text, type text, days int, nights int, price bigint, dests text[], style text,
  vi_title text, vi_slug text, en_title text, en_slug text, profile text);
insert into listing_seed values
  ('TH-BKK-03', 'group', 3, 2, 15900000::bigint, array['bangkok'], 'culture', 'Bangkok ba ngày', 'bangkok-ba-ngay', 'Three days in Bangkok', 'three-days-in-bangkok', 'normal'),
  ('TH-BKK-04', 'private', 4, 3, 22500000::bigint, array['bangkok'], 'family', 'Bangkok cho cả nhà', 'bangkok-cho-ca-nha', 'Bangkok for the whole family', 'bangkok-for-the-whole-family', 'private'),
  ('TH-CNX-05', 'group', 5, 4, 28900000::bigint, array['chiang-mai'], 'culture', 'Chiang Mai và những ngôi chùa trên núi', 'chiang-mai-va-nhung-ngoi-chua-tren-nui', 'Chiang Mai and its mountain temples', 'chiang-mai-and-its-mountain-temples', 'few'),
  ('TH-CNX-06', 'group', 6, 5, 31500000::bigint, array['chiang-mai'], 'family', 'Voi và rừng Chiang Mai', 'voi-va-rung-chiang-mai', 'Elephants and forests of Chiang Mai', 'elephants-and-forests-of-chiang-mai', 'soldout'),
  ('TH-NTH-07', 'group', 7, 6, 36900000::bigint, array['chiang-mai', 'bangkok'], 'culture', 'Bắc Thái Lan bảy ngày', 'bac-thai-lan-bay-ngay', 'Seven days in northern Thailand', 'seven-days-in-northern-thailand', 'normal'),
  ('TH-BKK-08', 'private', 8, 7, 58000000::bigint, array['bangkok', 'chiang-mai'], 'family', 'Thái Lan riêng tư cho gia đình', 'thai-lan-rieng-tu-cho-gia-dinh', 'Private Thailand for families', 'private-thailand-for-families', 'private'),
  ('TH-CNX-09', 'group', 9, 8, 45900000::bigint, array['chiang-mai'], 'culture', 'Đường mòn Doi Inthanon', 'duong-mon-doi-inthanon', 'The Doi Inthanon trails', 'the-doi-inthanon-trails', 'cutoff'),
  ('TH-BKK-10', 'group', 10, 9, 52000000::bigint, array['bangkok'], 'culture', 'Bangkok và cố đô Ayutthaya', 'bangkok-va-co-do-ayutthaya', 'Bangkok and old Ayutthaya', 'bangkok-and-old-ayutthaya', 'closed'),
  ('TH-TH-12', 'private', 12, 11, 96000000::bigint, array['thailand'], 'family', 'Thái Lan từ bắc vào nam', 'thai-lan-tu-bac-vao-nam', 'Thailand from north to south', 'thailand-from-north-to-south', 'private'),
  ('TH-TH-15', 'group', 15, 14, 128000000::bigint, array['thailand'], 'culture', 'Thái Lan mười lăm ngày', 'thai-lan-muoi-lam-ngay', 'Fifteen days in Thailand', 'fifteen-days-in-thailand', 'normal'),
  ('FR-PAR-03', 'group', 3, 2, 39900000::bigint, array['paris'], 'culture', 'Paris cuối tuần', 'paris-cuoi-tuan', 'A weekend in Paris', 'a-weekend-in-paris', 'normal'),
  ('FR-PAR-04', 'private', 4, 3, 62000000::bigint, array['paris'], 'family', 'Paris cùng con trẻ', 'paris-cung-con-tre', 'Paris with children', 'paris-with-children', 'private'),
  ('FR-PAR-05', 'group', 5, 4, 74500000::bigint, array['paris'], 'culture', 'Bảo tàng Paris', 'bao-tang-paris', 'The museums of Paris', 'the-museums-of-paris', 'few'),
  ('FR-AVN-06', 'group', 6, 5, 81000000::bigint, array['avignon'], 'culture', 'Avignon và sông Rhône', 'avignon-va-song-rhone', 'Avignon and the Rhône', 'avignon-and-the-rhone', 'normal'),
  ('FR-PRO-07', 'group', 7, 6, 92000000::bigint, array['provence'], 'family', 'Provence cho gia đình', 'provence-cho-gia-dinh', 'Provence for families', 'provence-for-families', 'normal'),
  ('FR-PRO-08', 'private', 8, 7, 145000000::bigint, array['provence', 'avignon'], 'culture', 'Làng đá Provence riêng tư', 'lang-da-provence-rieng-tu', 'Private Provence hill villages', 'private-provence-hill-villages', 'private'),
  ('FR-FR-09', 'group', 9, 8, 118000000::bigint, array['paris', 'avignon'], 'culture', 'Từ Paris đến Avignon', 'tu-paris-den-avignon', 'From Paris to Avignon', 'from-paris-to-avignon', 'soldout'),
  ('FR-FR-10', 'group', 10, 9, 135000000::bigint, array['france'], 'culture', 'Nước Pháp mười ngày', 'nuoc-phap-muoi-ngay', 'Ten days in France', 'ten-days-in-france', 'normal'),
  ('FR-FR-12', 'group', 12, 11, 168000000::bigint, array['france'], 'culture', 'Nước Pháp chậm rãi', 'nuoc-phap-cham-rai', 'France, slowly', 'france-slowly', 'normal'),
  ('FR-FR-14', 'private', 14, 13, 245000000::bigint, array['france'], 'family', 'Nước Pháp riêng cho gia đình', 'nuoc-phap-rieng-cho-gia-dinh', 'A private France for families', 'a-private-france-for-families', 'private'),
  ('FR-FR-16', 'group', 16, 15, 298000000::bigint, array['france'], 'culture', 'Đại hành trình nước Pháp', 'dai-hanh-trinh-nuoc-phap', 'The grand tour of France', 'the-grand-tour-of-france', 'normal'),
  ('TH-BKK-02', 'group', 2, 1, 15000000::bigint, array['bangkok'], 'culture', 'Bangkok hai ngày', 'bangkok-hai-ngay', 'Two days in Bangkok', 'two-days-in-bangkok', 'normal'),
  ('TH-CNX-04', 'group', 4, 3, 19900000::bigint, array['chiang-mai'], 'culture', 'Chợ đêm Chiang Mai', 'cho-dem-chiang-mai', 'Chiang Mai night markets', 'chiang-mai-night-markets', 'normal'),
  ('FR-PAR-06', 'group', 6, 5, 86000000::bigint, array['paris'], 'culture', 'Paris và lâu đài Versailles', 'paris-va-lau-dai-versailles', 'Paris and Versailles', 'paris-and-versailles', 'normal'),
  ('TH-TH-18', 'group', 18, 17, 175000000::bigint, array['thailand'], 'culture', 'Thái Lan mười tám ngày', 'thai-lan-muoi-tam-ngay', 'Eighteen days in Thailand', 'eighteen-days-in-thailand', 'normal'),
  ('FR-PAR-07', 'group', 7, 6, 99000000::bigint, array['paris'], 'culture', 'Paris mùa xuân', 'paris-mua-xuan', 'Paris in spring', 'paris-in-spring', 'vi-only');

insert into public.tours (code, type, scope, status, duration_days, duration_nights, min_pax, max_pax, min_pax_to_operate,
  from_price, deposit_percent, balance_due_days, is_featured, cancellation_policy_id)
select s.code, s.type::public.tour_type, 'international', 'draft', s.days, s.nights, case when s.type = 'private' then 2 else 1 end,
       case when s.type = 'private' then 8 else 12 end, case when s.type = 'group' then 6 end,
       s.price, 30, 30, false, (select id from public.cancellation_policies where is_default limit 1)
from listing_seed s;

insert into public.tour_translations (tour_id, locale, slug, title, summary, seo_description, is_published)
select t.id, v.locale::public.locale, v.slug, v.title, v.title || '.', v.title || '.', true
from listing_seed s
join public.tours t on t.code = s.code
cross join lateral (values ('vi', s.vi_slug, s.vi_title), ('en', s.en_slug, s.en_title)) as v(locale, slug, title)
where v.locale = 'vi' or s.profile <> 'vi-only';

insert into public.tour_destinations (tour_id, destination_id)
select t.id, d.id from listing_seed s join public.tours t on t.code = s.code
cross join lateral unnest(s.dests) as k(key) join public.destinations d on d.key = k.key;

insert into public.tour_travel_styles (tour_id, travel_style_id)
select t.id, st.id from listing_seed s join public.tours t on t.code = s.code join public.travel_styles st on st.key = s.style;

-- Departures: one a month from day 20 for 12 months (group tours only).
--   few: the first date has only 3 seats; soldout: the first date is closed (a full date needs
--   bookings, and seats_reserved must always match them: check_seat_invariant()); closed: every
--   date closed (no bookable date, "contact us for dates"); cutoff: an extra date 3 days out
--   (inside the cutoff). Seats are never reserved here.
insert into public.departures (tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult, price_child, single_supplement)
select t.id, (current_date + 20 + g * 30)::date, (current_date + 20 + g * 30 + s.days - 1)::date,
       case when s.profile = 'few' and g = 0 then 3 else 12 end, 0,
       case when s.profile = 'closed' or (s.profile = 'soldout' and g = 0) then 'closed' else 'open' end::public.departure_status,
       s.price + (g % 3) * 1000000, (s.price + (g % 3) * 1000000) * 3 / 4, s.price / 5
from listing_seed s join public.tours t on t.code = s.code
cross join generate_series(0, 11) as g
where s.type = 'group';
insert into public.departures (tour_id, start_date, end_date, capacity, seats_reserved, status, price_adult)
select t.id, current_date + 3, current_date + 3 + s.days - 1, 12, 0, 'open', s.price - 2000000
from listing_seed s join public.tours t on t.code = s.code where s.profile = 'cutoff';

insert into public.media (id, path, mime_type, width, height, size_bytes, alt, credit)
select pg_temp.seed_uuid('seed-media-' || s.code), '2026/01/' || pg_temp.seed_uuid('seed-media-' || s.code) || '.jpg',
       'image/jpeg', 2400, 1600, 800000, jsonb_build_object('vi', s.vi_title, 'en', s.en_title), 'Sample image'
from listing_seed s;
update public.tours t set hero_media_id = pg_temp.seed_uuid('seed-media-' || t.code) from listing_seed s where s.code = t.code;
update public.tours t set status = 'published', published_at = now() - interval '1 day' from listing_seed s where s.code = t.code;

-- ============================================================================================
-- Phase 3 PR M: a scheduled article (development only)
-- ============================================================================================
-- Published, but with published_at tomorrow: public pages and search leave it out until then.
insert into public.media (id, path, mime_type, width, height, size_bytes, alt, credit) values
  (pg_temp.seed_uuid('seed-post-scheduled'), '2026/01/' || pg_temp.seed_uuid('seed-post-scheduled') || '.jpg',
   'image/jpeg', 2400, 1600, 700000, '{"vi": "Ruộng bậc thang mùa nước đổ", "en": "Terraced fields in the flooding season"}', 'Sample image');
insert into public.posts (id, status, category_id, cover_media_id) values
  (pg_temp.seed_uuid('seed-post-scheduled'), 'draft', pg_temp.seed_uuid('seed-topic-guides'), pg_temp.seed_uuid('seed-post-scheduled'));
insert into public.post_translations (post_id, locale, slug, title, excerpt, content, seo_description, is_published) values
  (pg_temp.seed_uuid('seed-post-scheduled'), 'vi', 'mua-nuoc-do-mu-cang-chai', 'Mùa nước đổ ở Mù Cang Chải',
   'Bài hẹn giờ: chưa đến ngày đăng.',
   '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Bài hẹn giờ."}]}]}',
   'Bài hẹn giờ.', true);
update public.posts set status = 'published', published_at = now() + interval '1 day'
where id = pg_temp.seed_uuid('seed-post-scheduled');
