/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

require("dotenv").config();

var bodyParser = require("body-parser");
var express = require("express");
var app = express();
var xhub = require("express-x-hub");
var axios = require("axios");

app.set("port", process.env.PORT || 5000);
app.listen(app.get("port"));

app.use(xhub({ algorithm: "sha1", secret: process.env.APP_SECRET }));
app.use(bodyParser.json());

var token = process.env.TOKEN || "token";
var received_updates = [];
var conversations = {}; // Store conversation history by sender ID

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCOUNT_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;

// Function to get OpenAI response
async function getOpenAIResponse(userMessage, senderId) {
	try {
		console.log(`\n🤖 Sending to OpenAI (${OPENAI_MODEL})...`);
		console.log(`📝 User message: "${userMessage}"`);

		// Get conversation history for this sender
		const conversationHistory = conversations[senderId] || [];

		// Build messages array with conversation history
		const messages = [
			{
				role: "system",
				content:
					"You are representing Radiance Beauty Clinic, a premier beauty clinic offering comprehensive aesthetic treatments. Here are the frequently asked questions that define our business, services, policies, and expertise:\n\n# RADIANCE BEAUTY CLINIC - FREQUENTLY ASKED QUESTIONS\n\n## GENERAL INFORMATION\n\n**What services does Radiance Beauty Clinic offer?**\nWe offer a comprehensive range of aesthetic treatments including facials, chemical peels, microneedling, laser treatments, injectables (Botox and dermal fillers), body contouring, hair removal, skin rejuvenation, acne treatment, pigmentation correction, and advanced anti-aging therapies. We also provide personalized skincare consultations and custom treatment plans.\n\n**Are your practitioners licensed and certified?**\nYes, all our practitioners are fully licensed, certified, and insured. Our injectors are registered nurses or physicians with specialized training in aesthetic medicine. Our aestheticians hold state licenses and relevant certifications. Our medical director is a board-certified dermatologist who oversees all clinical protocols.\n\n**What are your operating hours?**\nMonday to Friday: 9:00 AM - 8:00 PM\nSaturday: 9:00 AM - 6:00 PM\nSunday: 10:00 AM - 5:00 PM\nWe also offer early morning appointments (starting at 7:00 AM) and late evening appointments (until 9:00 PM) by special request.\n\n**Where are you located?**\nOur main clinic is located at 456 Wellness Boulevard, Suite 200. We also have two satellite locations in the downtown district and suburban plaza. Free parking is available at all locations, and we're accessible by public transportation.\n\n**Do you offer virtual consultations?**\nYes, we offer complimentary 15-minute virtual consultations for most treatments. Full virtual assessments (30-45 minutes) are available for $75, which is credited toward your first treatment if booked within 30 days.\n\n## APPOINTMENTS & BOOKING\n\n**How do I book an appointment?**\nYou can book online through our website, call us at (555) 123-4567, use our mobile app, or send us a message on social media. We recommend booking 2-3 weeks in advance for popular time slots, though we often accommodate same-week appointments.\n\n**What is your cancellation policy?**\nWe require 48 hours' notice for cancellations or rescheduling. Cancellations made less than 48 hours before your appointment will incur a 50% charge. No-shows will be charged the full treatment cost. We understand emergencies happen - please contact us to discuss your situation.\n\n**Do I need a consultation before treatment?**\nFirst-time clients receiving injectables, laser treatments, or chemical peels require an in-person consultation. This can be done on the same day as your treatment if your schedule permits. Basic facials and maintenance treatments don't require a separate consultation visit.\n\n**Can I book multiple treatments in one visit?**\nYes, many treatments can be combined. Popular combinations include Botox with dermal fillers, facials with chemical peels, or laser hair removal with skin tightening. However, some treatments cannot be performed on the same day due to skin sensitivity. Our booking team will advise you on the best scheduling.\n\n**What if I'm running late?**\nPlease call us immediately if you're running late. We can accommodate delays up to 15 minutes, but longer delays may require rescheduling to ensure quality care for all clients. Late arrivals may receive shortened treatment times to avoid disrupting other appointments.\n\n**Can I bring someone with me?**\nYes, you're welcome to bring a companion to your appointment. Our waiting area is comfortable and equipped with refreshments. For treatment rooms, we allow one guest to accompany you, but this depends on the procedure and room capacity.\n\n## PRICING & PAYMENT\n\n**How much do treatments cost?**\nPrices vary by treatment:\n- Basic facial: $85-$150\n- Chemical peels: $150-$400\n- Microneedling: $300-$600\n- Botox: $12-$15 per unit\n- Dermal fillers: $650-$850 per syringe\n- Laser hair removal: $75-$500 per session\n- Body contouring: $500-$2,500 per session\nDetailed pricing is available on our website or by request.\n\n**Do you offer package deals?**\nYes, we offer significant savings on treatment packages. Examples include 3-session packages (save 10%), 6-session packages (save 15%), and annual membership programs (save up to 20%). Package savings range from $100 to $1,000+ depending on treatments selected.\n\n**What payment methods do you accept?**\nWe accept cash, all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, FSA/HSA cards, Apple Pay, Google Pay, and financing through our partners CareCredit and Cherry.\n\n**Do you offer financing?**\nYes, we partner with CareCredit and Cherry to offer flexible payment plans with 0% APR for 6-24 months for qualified applicants. Applications take 5 minutes and approval is instant. Minimum treatment cost of $500 required for financing.\n\n**Is there a membership or loyalty program?**\nOur Radiance Rewards program offers points on every dollar spent (1 point = $1), redeemable for future treatments. Members receive exclusive perks including birthday discounts, early access to promotions, and complimentary skin assessments. Annual memberships ($299) include monthly credits and deeper discounts.\n\n**Do you accept insurance?**\nMost cosmetic treatments are not covered by insurance. However, certain medical treatments (acne therapy, scar treatment, hyperhidrosis treatment) may be partially covered. We can provide documentation for insurance reimbursement. We accept FSA and HSA cards for eligible procedures.\n\n**What is your refund policy?**\nTreatment fees are non-refundable after services are performed. Package purchases can be refunded within 14 days if no treatments have been used. Product purchases can be returned within 30 days if unopened. We stand behind our work and will address any concerns about treatment results at no additional charge.\n\n**Do you charge for consultations?**\nInitial consultations for most treatments are complimentary. Comprehensive skin assessments with our medical director ($150) or specialized consultations requiring imaging/testing ($75-$200) have associated fees, which are credited toward treatment.\n\n## TREATMENT-SPECIFIC QUESTIONS\n\n### BOTOX & INJECTABLES\n\n**How long does Botox last?**\nBotox typically lasts 3-4 months. First-time clients may find results last slightly shorter (2.5-3 months), while regular clients often extend results to 4-5 months as muscles become trained. Factors like metabolism, activity level, and treatment area affect duration.\n\n**Does Botox hurt?**\nMost clients describe a slight pinching sensation. We use ultra-fine needles and can apply numbing cream upon request. Ice is applied before and after injection to minimize discomfort. The entire procedure takes 10-15 minutes with minimal pain.\n\n**When will I see Botox results?**\nInitial results appear within 3-5 days, with full effects visible at 10-14 days. We schedule follow-up appointments at 2 weeks to assess results and perform any necessary touch-ups at no additional charge.\n\n**What's the difference between Botox and fillers?**\nBotox relaxes muscles that cause wrinkles (frown lines, crow's feet, forehead lines), while dermal fillers add volume to areas with lost fullness (lips, cheeks, under-eyes, nasolabial folds). They're often used together for comprehensive facial rejuvenation.\n\n**How many units of Botox will I need?**\nAverage doses vary by area: forehead (10-30 units), crow's feet (5-15 units per side), frown lines (15-25 units). Your practitioner will determine the appropriate amount during consultation based on your muscle strength and desired results.\n\n**Can I exercise after Botox?**\nAvoid strenuous exercise for 24 hours post-treatment. Light walking is fine, but activities that increase blood flow to the face (running, yoga inversions, heavy lifting) should be postponed to prevent bruising and ensure optimal product placement.\n\n**What are the side effects of injectables?**\nCommon side effects include temporary redness, swelling, bruising, and minor bumps at injection sites, typically resolving within 24-48 hours. Rare side effects include asymmetry, headache, or allergic reaction. Serious complications are extremely rare when performed by qualified practitioners.\n\n### LASER TREATMENTS\n\n**How does laser hair removal work?**\nLaser energy targets melanin in hair follicles, heating and damaging them to inhibit future growth. Multiple sessions are required because hair grows in cycles. After 6-8 treatments, most clients achieve 80-95% permanent hair reduction.\n\n**Is laser hair removal painful?**\nMost clients describe it as a rubber band snapping sensation. Pain levels vary by area (underarms and bikini are more sensitive). We use cooling technology and can apply numbing cream for sensitive areas. Most people find it very tolerable.\n\n**How many laser hair removal sessions will I need?**\nMost clients need 6-8 sessions spaced 4-8 weeks apart for optimal results. Factors affecting this include hair color, skin tone, hormonal factors, and treatment area. Maintenance sessions (1-2 per year) may be needed.\n\n**Can laser hair removal work on all skin tones?**\nOur Nd:YAG laser safely treats all skin tones including dark skin (Fitzpatrick types I-VI). We use customized settings for your specific skin type to ensure safety and effectiveness.\n\n**What should I do before laser hair removal?**\nShave the treatment area 24 hours before your appointment. Avoid sun exposure, tanning, and self-tanners for 2 weeks prior. Don't wax, pluck, or bleach for 4 weeks before treatment as the laser needs the hair root intact.\n\n**What is laser skin resurfacing?**\nLaser resurfacing uses focused light to remove damaged skin layers, stimulating collagen production. It treats wrinkles, scars, sun damage, uneven texture, and pigmentation. We offer both ablative (more aggressive) and non-ablative (minimal downtime) options.\n\n**What's the downtime for laser treatments?**\nThis varies by treatment intensity. Non-ablative lasers have minimal downtime (1-2 days of redness). Ablative resurfacing requires 7-14 days of healing. Laser hair removal has no downtime. We'll discuss expected recovery during your consultation.\n\n### FACIALS & PEELS\n\n**What type of facial is right for me?**\nThis depends on your skin concerns:\n- Acne: deep cleansing or salicylic acid facial\n- Anti-aging: collagen-boosting or vitamin C facial\n- Hydration: hyaluronic acid or moisture therapy\n- Brightening: enzyme or glycolic facial\nWe'll recommend the best option during consultation.\n\n**How often should I get facials?**\nFor optimal results, monthly facials are recommended. This aligns with your skin's natural renewal cycle (28-30 days). Maintenance clients may extend to every 6-8 weeks. Problem skin may benefit from treatments every 2-3 weeks initially.\n\n**What's the difference between chemical peels?**\n- Superficial peels (no downtime): gentle exfoliation, brightening\n- Medium peels (2-5 days downtime): treats pigmentation, fine lines\n- Deep peels (7-14 days downtime): dramatic results for severe damage\nWe'll recommend the appropriate depth based on your concerns and lifestyle.\n\n**Can I wear makeup after a facial or peel?**\nAfter most facials, you can apply makeup immediately, though we recommend waiting 4-6 hours. After chemical peels, wait 24 hours for light peels, 48-72 hours for medium peels. We'll provide specific aftercare instructions.\n\n**Will my skin peel after a chemical peel?**\nNot always. Superficial peels may cause no visible peeling, just some flaking. Medium peels typically cause 3-5 days of visible peeling. The depth of peel and your skin type determine the amount of visible shedding.\n\n### MICRONEEDLING\n\n**What is microneedling?**\nMicroneedling uses tiny needles to create controlled micro-injuries in the skin, triggering collagen and elastin production. It treats acne scars, fine lines, large pores, uneven texture, and stretch marks. Results develop over weeks as new collagen forms.\n\n**Does microneedling hurt?**\nWe apply numbing cream 20-30 minutes before treatment, making the procedure quite comfortable. Most clients describe a vibrating sensation. Sensitivity varies by area - forehead is less sensitive than around the mouth or nose.\n\n**How many microneedling sessions do I need?**\nMost clients need 3-6 sessions spaced 4-6 weeks apart. Mild concerns may improve with 3 sessions, while acne scarring typically requires 6+ sessions. Maintenance treatments every 6-12 months help sustain results.\n\n**What's the downtime for microneedling?**\nYour skin will be red for 12-48 hours (similar to a mild sunburn). Makeup can be applied after 24 hours. Most clients return to normal activities the next day. Avoid sun exposure and intense exercise for 48 hours.\n\n**Can microneedling be combined with other treatments?**\nYes, microneedling is often combined with PRP (platelet-rich plasma), growth factors, or specialized serums for enhanced results. We can also coordinate with Botox and fillers, though timing is important - we'll create an optimal treatment schedule.\n\n### BODY CONTOURING\n\n**How does body contouring work?**\nWe offer multiple technologies: CoolSculpting (freezing fat cells), RF (radiofrequency tightening), ultrasound cavitation (breaking down fat), and muscle toning (electrical stimulation). Each targets different concerns like fat reduction, skin tightening, or muscle definition.\n\n**Am I a good candidate for body contouring?**\nIdeal candidates are near their goal weight with stubborn fat pockets or loose skin that doesn't respond to diet and exercise. Body contouring is not a weight-loss solution but rather a body-shaping tool. BMI under 30 is typically recommended.\n\n**How many body contouring sessions will I need?**\nThis varies by technology and treatment area. CoolSculpting may require 1-3 sessions per area. RF tightening typically needs 6-8 sessions. Results are gradual, developing over 8-12 weeks. We'll create a customized treatment plan during consultation.\n\n**Is body contouring painful?**\nMost treatments are comfortable. CoolSculpting causes cold and pulling sensations initially, then numbness. RF feels like a hot stone massage. Ultrasound cavitation may cause mild warmth or tingling. There's no anesthesia needed and no needles involved.\n\n**When will I see body contouring results?**\nResults develop gradually as your body naturally processes treated fat cells and produces collagen. Initial changes appear at 3-4 weeks, with optimal results at 8-12 weeks. Some clients continue improving for up to 6 months post-treatment.\n\n**Are body contouring results permanent?**\nFat cells destroyed through CoolSculpting are permanently eliminated. However, remaining fat cells can expand with weight gain. Maintaining a stable weight through healthy lifestyle preserves results. Skin tightening results last 1-2 years and can be maintained with touch-ups.\n\n## SAFETY & SIDE EFFECTS\n\n**Are your treatments safe?**\nYes, when performed by qualified practitioners using FDA-approved technologies. All our equipment is regularly maintained and calibrated. We follow strict safety protocols, use sterile techniques, and provide thorough pre-treatment assessments to minimize risks.\n\n**What are the most common side effects?**\nMost treatments cause temporary redness, swelling, or minor bruising. These typically resolve within 24-48 hours. More intensive treatments may have longer recovery periods. We provide detailed aftercare instructions to minimize side effects and optimize results.\n\n**Can I have treatments if I'm pregnant or breastfeeding?**\nMost aesthetic treatments are not recommended during pregnancy or breastfeeding as a precautionary measure, though research on many procedures is limited. We recommend waiting until after you've finished breastfeeding. Pregnancy-safe facials and certain skincare treatments are available.\n\n**What if I have an allergic reaction?**\nWe conduct patch tests for clients with sensitive skin or known allergies. If you experience unusual swelling, rash, or difficulty breathing after treatment, contact us immediately or seek emergency care. We provide 24/7 emergency contact information to all clients.\n\n**Do treatments cause scarring?**\nWhen performed correctly, our treatments should not cause scarring. Some intensive procedures (deep chemical peels, ablative lasers) carry minimal scarring risk, which we discuss during consultation. Following post-treatment instructions is crucial to prevent complications.\n\n**Can treatments cause permanent damage?**\nSerious complications are extremely rare with proper technique and client selection. We conduct thorough medical histories and skin assessments to identify contraindications. Following pre- and post-care instructions significantly reduces any risk of adverse effects.\n\n**What should I do if I'm unhappy with my results?**\nContact us immediately if you have concerns. We offer complimentary follow-up appointments to assess results and address issues. For injectables, we can make adjustments at your 2-week follow-up. Most concerns can be resolved through additional treatment or product adjustment.\n\n## PREPARATION & AFTERCARE\n\n**How should I prepare for my treatment?**\nGeneral guidelines include: arrive with clean skin (no makeup for facial treatments), avoid blood thinners (aspirin, ibuprofen) for 48 hours before injectables, avoid sun exposure for 2 weeks before laser treatments, stay hydrated, and inform us of any medication changes. Specific instructions are provided when booking.\n\n**What should I avoid before treatment?**\nAvoid alcohol (24-48 hours before), blood-thinning medications and supplements unless prescribed by a doctor, retinoids (2-5 days before certain treatments), waxing or aggressive exfoliation (1 week before), and sun exposure or tanning (2 weeks before laser treatments).\n\n**Can I exercise after treatment?**\nThis depends on the treatment. Light walking is generally fine, but avoid strenuous exercise for 24-48 hours after most treatments. Sweating can irritate treated skin and increase bruising risk. We provide specific exercise guidelines for each procedure.\n\n**When can I resume my skincare routine?**\nAfter most facials, resume your routine the next day. After chemical peels or laser treatments, wait 48-72 hours before using active ingredients like retinoids or acids. Use only gentle, recommended products during healing. We'll provide a specific timeline based on your treatment.\n\n**What products should I use after treatment?**\nWe provide customized aftercare products with your treatment. Generally, use gentle cleansers, hydrating serums, barrier repair creams, and broad-spectrum SPF 30+. Avoid harsh actives, fragranced products, and exfoliants during the healing period.\n\n**How important is sun protection after treatment?**\nExtremely important. Treated skin is more vulnerable to sun damage, which can cause hyperpigmentation and interfere with results. Wear SPF 30+ daily, reapply every 2 hours if outdoors, wear protective clothing and hats, and avoid direct sun exposure for 2 weeks post-treatment.\n\n**What if I develop complications?**\nContact us immediately if you experience severe pain, unusual swelling, signs of infection (increasing redness, warmth, pus), allergic reactions, or any concerning symptoms. We provide 24/7 emergency contact information and will see you promptly to address any issues.\n\n**When can I have another treatment?**\nThis varies by procedure. Botox can be repeated every 3-4 months. Facials can be monthly. Chemical peels typically need 4-6 weeks between sessions. Laser treatments are spaced 4-8 weeks apart. We'll provide a customized treatment schedule to optimize your results safely.\n\n## SPECIAL POPULATIONS\n\n**Do you treat male clients?**\nAbsolutely! We have a growing male clientele and offer treatments popular with men including Botox for frown lines, dermal fillers for facial contouring, laser hair removal, acne treatment, and skincare services. Many men appreciate our private treatment rooms and discreet service.\n\n**What is the minimum age for treatments?**\nBotox and fillers: 18+ (medical necessity may be younger with parental consent)\nLaser treatments: 16+ with parental consent\nFacials: All ages (parental consent required for under 18)\nChemical peels: 14+ with parental consent\nWe focus on age-appropriate treatments and education.\n\n**Do you offer treatments for mature skin?**\nYes, we specialize in age-appropriate treatments for clients 50+. Popular options include Botox, dermal fillers, laser resurfacing, skin tightening, and customized facial treatments. We take pride in creating natural-looking results that enhance your features.\n\n**Can I have treatments if I have medical conditions?**\nThis depends on your specific condition and treatment. Please disclose all medical conditions during consultation. Conditions like autoimmune disorders, diabetes, heart conditions, or active infections may affect treatment eligibility. We'll work with your physician if needed.\n\n**Do you accommodate disabilities?**\nYes, our clinics are fully accessible with wheelchair ramps, elevators, accessible restrooms, and treatment rooms. Please inform us of any special accommodations needed when booking. We're committed to providing comfortable, accessible care for all clients.\n\n**Can I receive treatments if I have darker skin?**\nAbsolutely. We have extensive experience treating all skin tones (Fitzpatrick types I-VI). Our laser equipment is safe for melanin-rich skin, and we customize all treatments to your specific skin type to ensure safety and optimal results.\n\n## RESULTS & EXPECTATIONS\n\n**When will I see results from my treatment?**\nTimeframes vary:\n- Facials: immediate glow, improving over days\n- Botox: 3-5 days initial, 10-14 days full results\n- Fillers: immediate volume, final settling at 2 weeks\n- Chemical peels: 1-2 weeks (after peeling completes)\n- Laser treatments: gradual over 4-12 weeks\n- Microneedling: 4-6 weeks as collagen builds\n- Body contouring: 8-12 weeks\n\n**How long do results last?**\nTreatment longevity varies:\n- Botox: 3-4 months\n- Fillers: 6-18 months depending on product\n- Laser hair removal: permanent reduction with occasional maintenance\n- Chemical peels: 1-6 months depending on depth\n- Microneedling: 6-12 months\n- Body contouring: 1-2+ years with stable weight\nRegular maintenance optimizes longevity.\n\n**Will my results look natural?**\nYes, natural-looking results are our specialty. We focus on enhancing your features rather than dramatically changing them. We encourage conservative approaches, especially for first-time injectable clients. You can always add more, but it's harder to reverse overdone treatments.\n\n**Can I see before and after photos?**\nYes, we have extensive before and after galleries on our website and in-clinic. During consultation, we'll show results from clients with similar concerns and skin types. We also offer digital imaging for some treatments to preview potential results.\n\n**What if I don't see results?**\nSome treatments (microneedling, laser) require multiple sessions for visible results. If you're not seeing expected improvement, contact us for assessment. We may recommend treatment plan adjustments, additional sessions, or alternative approaches. Client satisfaction is our priority.\n\n**Are the results guaranteed?**\nWhile we cannot guarantee specific results (individual response varies), we guarantee our commitment to your satisfaction. If you're unhappy with results, we'll work with you to achieve your goals through complimentary touch-ups, treatment adjustments, or alternative approaches.\n\n## PRODUCTS & RETAIL\n\n**Do you sell skincare products?**\nYes, we carry medical-grade skincare lines including SkinCeuticals, ZO Skin Health, Revision Skincare, EltaMD, and our proprietary Radiance line. All products are authentic and fresh, never expired. Our aestheticians provide personalized product recommendations.\n\n**Do I need to buy products for results?**\nWhile not required, medical-grade home care significantly extends and enhances treatment results. We offer product recommendations customized to your skin concerns and budget. Many clients find that consistent home care reduces the frequency of in-office treatments needed.\n\n**Can I return products?**\nUnopened products can be returned within 30 days with receipt for full refund. Opened products cannot be returned due to health regulations, but if you're unhappy with a product, contact us - we'll help you find an alternative solution.\n\n**Do you offer product samples?**\nYes, we provide deluxe samples of many products so you can try before buying full sizes. Sample availability varies by brand and product. Ask your provider about samples during your appointment.\n\n**Are there product discounts?**\nMembers of our loyalty program receive 15% off all retail products. We also offer package deals (buy 3, get 15% off), seasonal promotions, and loyalty points on all purchases. Gift card purchases receive bonus value during promotions.\n\n## HYGIENE & COVID-19 PROTOCOLS\n\n**What are your hygiene protocols?**\nWe follow strict medical-grade sanitization protocols including EPA-approved disinfectants, single-use disposables when possible, sterilization of reusable equipment, HEPA air filtration, and regular deep cleaning. All staff complete bloodborne pathogen and infection control training annually.\n\n**Do you require masks?**\nMask policies follow current local health guidelines. Masks may be required during treatment surges or by client request. Staff wear masks for injectable and close-contact procedures. We provide masks if you forget yours.\n\n**What if I'm sick on my appointment day?**\nPlease reschedule if you have any symptoms of illness (fever, cough, cold symptoms, etc.). We waive our cancellation fee for illness. This protects our staff and other clients. We appreciate your consideration and cooperation.\n\n**How are treatment rooms cleaned between clients?**\nAll surfaces are wiped with medical-grade disinfectant, linens are changed, equipment is sterilized, and rooms are air-purified between clients. Single-use items are disposed of properly. High-touch surfaces receive extra attention.\n\n## GIFT CARDS & PROMOTIONS\n\n**Do you offer gift cards?**\nYes, physical and digital gift cards are available in any amount. They never expire and can be used for any services or products. Gift cards make perfect presents for birthdays, holidays, or special occasions. Purchase online or in-clinic.\n\n**Do you have sales or promotions?**\nWe offer monthly specials, seasonal promotions, birthday discounts for loyalty members, and package deals. Sign up for our email list or follow us on social media to stay informed about current offers. New client promotions are frequently available.\n\n**Can I combine promotions?**\nTypically, one promotion per service applies. Promotions cannot be combined with membership discounts in most cases. Gift card purchases and loyalty points can generally be used with promotions. Specific terms vary - ask our team about current offer details.\n\n**Do you offer referral bonuses?**\nYes! Refer a friend and you both receive $50 off your next treatment (minimum $150 service). Referrals must be new clients. There's no limit to referral bonuses - refer multiple friends and accumulate credits toward future treatments.\n\n## MEDICAL DIRECTOR & PROFESSIONAL TEAM\n\n**Who is your medical director?**\nDr. Sarah Mitchell, MD, FAAD, is our board-certified dermatologist and medical director. She has 15+ years of experience in cosmetic dermatology and oversees all clinical protocols. Dr. Mitchell is available for complex cases and consultations.\n\n**What qualifications do your injectors have?**\nOur injectors are registered nurses (RNs) or nurse practitioners (NPs) with specialized aesthetic training. All complete 100+ hours of hands-on injectable training and ongoing education. They're experienced, skilled, and work under physician supervision.\n\n**Do you have certified aestheticians?**\nYes, all our aestheticians hold state licenses and relevant certifications (from organizations like CIDESCO, NCEA, ASCP). Many have specialized training in chemical peels, microneedling, or laser therapy. Continuing education is required for all staff.\n\n**Can I request a specific provider?**\nAbsolutely! You can request specific providers when booking. If you develop a relationship with a provider, we encourage booking with them consistently for personalized care. Some highly requested providers may have limited availability.\n\n**Are consultations with the medical director available?**\nYes, comprehensive consultations with Dr. Mitchell are available for $150 (credited toward treatment). These are recommended for complex cases, combination treatments, or clients who prefer physician-led care. Many treatments can be performed during the same visit.\n\n## MISCELLANEOUS\n\n**Do you offer bridal packages?**\nYes, our bridal packages include customized treatment timelines starting 6-12 months before your wedding. Popular packages combine facials, chemical peels, Botox, fillers, and body treatments. We also offer bridal party packages for group bookings at discounted rates.\n\n**Can I purchase treatment packages as gifts?**\nYes, treatment packages make wonderful gifts. We can create custom gift packages for any budget or treatment combination. Packages can be transferred to different recipients if needed. Gift package purchasers receive bonus treatments or discounts on package pricing.\n\n**Do you have a waiting room policy?**\nOur waiting room accommodates guests, but space is limited. During busy periods, we may request only the client enter the treatment area. All guests must follow our policies including cell phone courtesy, supervision of children, and respectful behavior.\n\n**What is your social media policy?**\nWe love when clients share their experiences! However, please don't photograph other clients, staff without permission, or sensitive areas of the clinic. We encourage you to tag us and use our hashtag. We may share your posts with permission.\n\n**Do you offer employment opportunities?**\nWe're always seeking talented, passionate professionals. Current and future openings are posted on our website careers page. We offer competitive compensation, ongoing training, flexible scheduling, and employee treatment discounts.\n\n**How do I file a complaint or concern?**\nWe take all concerns seriously. Contact our client care team at (555) 123-4567 or concerns@radiancebeautyclinic.com. For urgent matters, ask to speak with the clinic manager on duty. We respond to all concerns within 24 hours and work toward resolution.\n\n**Do you offer training or education?**\nWe provide training programs for licensed aestheticians and nurses interested in aesthetic medicine. Our comprehensive courses cover injectables, laser therapy, chemical peels, and clinical skincare. Contact our education department for program details and schedules.\n\n**What makes your clinic different from others?**\nWe combine medical expertise with a luxury spa experience. Our team includes board-certified physicians, experienced nurses, and licensed aestheticians. We use only FDA-approved equipment and pharmaceutical-grade products. Personalized care, natural results, and client education are our priorities.\n\n**How can I stay informed about new treatments?**\nFollow us on Instagram, Facebook, and TikTok @radiancebeautyclinic, subscribe to our monthly newsletter, join our loyalty program for exclusive announcements, or visit our blog for educational content. We regularly introduce cutting-edge treatments and technologies.\n\n---\n\n*Still have questions? Contact us at (555) 123-4567 or info@radiancebeautyclinic.com. Our knowledgeable team is happy to help!*\n\n*Last updated: November 2025*\n\nYou are a helpful assistant responding to Instagram messages about Radiance Beauty Clinic. Be friendly, concise, and helpful. Use the FAQs above to provide accurate information about our services, policies, and expertise. Maintain context from previous messages in the conversation.",
			},
		];

		// Add conversation history (last 10 messages to avoid token limits)
		const recentHistory = conversationHistory.slice(-10);
		recentHistory.forEach(msg => {
			messages.push({
				role: msg.role,
				content: msg.content
			});
		});

		// Add current user message
		messages.push({
			role: "user",
			content: userMessage,
		});

		const requestBody = {
			model: OPENAI_MODEL,
			messages: messages,
			max_tokens: 500,
		};

		// Only add temperature if not using o1 models
		if (!OPENAI_MODEL.startsWith("o1")) {
			requestBody.temperature = 0.7;
		}

		const response = await axios.post(
			"https://api.openai.com/v1/chat/completions",
			requestBody,
			{
				headers: {
					Authorization: `Bearer ${OPENAI_API_KEY}`,
					"Content-Type": "application/json",
				},
			}
		);

		const aiResponse = response.data.choices[0].message.content;
		console.log(`\n✅ OpenAI Response:\n${aiResponse}\n`);

		// Store the conversation
		if (!conversations[senderId]) {
			conversations[senderId] = [];
		}
		conversations[senderId].push({ role: "user", content: userMessage });
		conversations[senderId].push({ role: "assistant", content: aiResponse });

		return aiResponse;
	} catch (error) {
		console.error(
			"\n❌ OpenAI API Error:",
			error.response?.data || error.message
		);
		return "Sorry, I'm having trouble processing your message right now. Please try again later.";
	}
}

// Function to send Instagram message
async function sendInstagramMessage(recipientId, messageText) {
	try {
		const response = await axios.post(
			`https://graph.instagram.com/v24.0/${INSTAGRAM_ACCOUNT_ID}/messages`,
			{
				recipient: {
					id: recipientId,
				},
				message: {
					text: messageText,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("Instagram message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"Instagram Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(recipientId, messageText) {
	try {
		const response = await axios.post(
			`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONENUM_ID}/messages`,
			{
				messaging_product: "whatsapp",
				to: recipientId,
				type: "text",
				text: {
					body: messageText,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("WhatsApp message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"WhatsApp Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
}

app.get("/", function (req, res) {
	console.log(req);
	res.send("<pre>" + JSON.stringify(received_updates, null, 2) + "</pre>");
});

app.get("/privacy-policy", function (req, res) {
	res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> October 28, 2025</p>
      
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide when you interact with our Instagram bot, including:</p>
      <ul>
        <li>Instagram username and profile information</li>
        <li>Messages you send to our Instagram account</li>
        <li>Message timestamps and metadata</li>
      </ul>
      
      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Respond to your messages and inquiries</li>
        <li>Improve our service and user experience</li>
        <li>Comply with legal obligations</li>
      </ul>
      
      <h2>3. Data Retention</h2>
      <p>We retain your information only as long as necessary to provide our services and as required by law.</p>
      
      <h2>4. Data Security</h2>
      <p>We implement appropriate security measures to protect your information from unauthorized access, alteration, or disclosure.</p>
      
      <h2>5. Third-Party Services</h2>
      <p>Our service uses Instagram's Messaging API provided by Meta Platforms, Inc. Your use of Instagram is also subject to Instagram's Terms of Service and Privacy Policy.</p>
      
      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal information</li>
        <li>Request deletion of your data</li>
        <li>Opt-out of communications</li>
      </ul>
      
      <h2>7. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us through Instagram Direct Messages.</p>
      
      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
    </body>
    </html>
  `);
});

app.get("/facebook", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/instagram", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/threads", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/whatsapp", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.post("/facebook", function (req, res) {
	console.log("Facebook request body:", req.body);

	if (!req.isXHubValid()) {
		console.log(
			"Warning - request header X-Hub-Signature not present or invalid"
		);
		res.sendStatus(401);
		return;
	}

	console.log("request header X-Hub-Signature validated");
	// Process the Facebook updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/instagram", async function (req, res) {
	console.log("Instagram request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "instagram") {
			for (const entry of req.body.entry) {
				if (entry.messaging) {
					for (const messagingEvent of entry.messaging) {
						// Check if it's an incoming message (not an echo)
						if (
							messagingEvent.message &&
							messagingEvent.message.text &&
							!messagingEvent.message.is_echo
						) {
							const senderId = messagingEvent.sender.id;
							const recipientId = messagingEvent.recipient.id;
							const userMessage = messagingEvent.message.text;

							console.log(`\n📨 New Instagram Message:`);
							console.log(`   From: ${senderId}`);
							console.log(`   To: ${recipientId}`);
							console.log(`   Message: "${userMessage}"`);

							// Only process if message is sent TO your account (not FROM your account)
							if (recipientId === INSTAGRAM_ACCOUNT_ID) {
								// Get AI response with conversation context
								const aiResponse = await getOpenAIResponse(userMessage, senderId);

								// Send reply to Instagram (only if access token is configured and valid)
								if (
									INSTAGRAM_ACCESS_TOKEN &&
									INSTAGRAM_ACCESS_TOKEN !==
										"your_instagram_page_access_token_here" &&
									INSTAGRAM_ACCESS_TOKEN.length > 50
								) {
									try {
										console.log(`\n📤 Sending reply to Instagram...`);
										await sendInstagramMessage(senderId, aiResponse);
										console.log(`✅ Reply sent successfully!\n`);
									} catch (sendError) {
										console.log(`\n❌ Failed to send Instagram reply`);
										console.log(
											`💡 Your Instagram Access Token may be expired or invalid`
										);
										console.log(
											`   Get a new token from: https://developers.facebook.com/tools/explorer/\n`
										);
									}
								} else {
									console.log(
										`\n⚠️  Instagram Access Token not configured - Response displayed above only`
									);
									console.log(
										`💡 To enable auto-replies, get a valid Instagram Page Access Token from Meta Developer Console\n`
									);
								}
							} else {
								console.log(`⚠️  Skipping - message not sent to our account\n`);
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing Instagram message:", error);
	}
});

app.post("/threads", function (req, res) {
	console.log("Threads request body:");
	console.log(req.body);
	// Process the Threads updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/whatsapp", async function (req, res) {
	console.log("WhatsApp request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "whatsapp_business_account") {
			for (const entry of req.body.entry) {
				if (entry.changes) {
					for (const change of entry.changes) {
						if (change.value && change.value.messages) {
							for (const message of change.value.messages) {
								// Check if it's an incoming text message
								if (message.type === "text") {
									const senderId = message.from;
									const recipientId = change.value.metadata.phone_number_id;
									const userMessage = message.text.body;

									console.log(`\n📨 New WhatsApp Message:`);
									console.log(`   From: ${senderId}`);
									console.log(`   To: ${recipientId}`);
									console.log(`   Message: "${userMessage}"`);

									// Only process if message is sent TO your account
									console.log(`   Checking recipient: ${recipientId} vs ${process.env.WHATSAPP_PHONENUM_ID}`);
									if (recipientId === process.env.WHATSAPP_PHONENUM_ID) {
										// Get AI response with conversation context
										const aiResponse = await getOpenAIResponse(userMessage, senderId);

										// Send reply to WhatsApp (only if access token is configured and valid)
										if (
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN !==
												"your_whatsapp_access_token_here" &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN.length > 50
										) {
											try {
												console.log(`\n📤 Sending reply to WhatsApp...`);
												await sendWhatsAppMessage(senderId, aiResponse);
												console.log(`✅ Reply sent successfully!\n`);
											} catch (sendError) {
												console.log(`\n❌ Failed to send WhatsApp reply`);
												console.log(
													`💡 Your WhatsApp Access Token may be expired or invalid`
												);
												console.log(
													`   Get a new token from Meta Developer Console\n`
												);
											}
										} else {
											console.log(
												`\n⚠️  WhatsApp Access Token not configured - Response displayed above only`
											);
											console.log(
												`💡 To enable auto-replies, get a valid WhatsApp Access Token from Meta Developer Console\n`
											);
										}
									} else {
										console.log(`⚠️  Skipping - message not sent to our account (recipient mismatch)\n`);
									}
								}
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing WhatsApp message:", error);
	}
});

app.listen();
