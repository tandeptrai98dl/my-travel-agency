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

-- Hero images for the sample tours. Rows only: the files are not in Storage, so admin previews show
-- the blur-less placeholder until real photos are uploaded through /admin/media.
insert into public.media (id, path, mime_type, width, height, size_bytes, alt, credit)
select md5('seed-media-' || t.code)::uuid,
       '2026/01/' || md5('seed-media-' || t.code)::uuid || '.jpg',
       'image/jpeg', 2400, 1600, 850000,
       jsonb_build_object('vi', vi.title, 'en', coalesce(en.title, vi.title)),
       'Sample image'
from public.tours t
join public.tour_translations vi on vi.tour_id = t.id and vi.locale = 'vi'
left join public.tour_translations en on en.tour_id = t.id and en.locale = 'en';

update public.tours t
set hero_media_id = md5('seed-media-' || t.code)::uuid;

update public.tours
set status = 'published', published_at = now()
where code in ('VN-HLB-03', 'VN-NTH-06', 'VN-HER-05', 'JP-KYT-07', 'FR-PRV-09');
