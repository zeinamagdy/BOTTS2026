merged all of that databased by zipcode, these are factors that we can use to filter recommendations
added also QUALITY of schools, not just that they exist

Location / identity
plz, lat, lon, bezirk, n_addresses

Location quality (Wohnlage)
pct_wohnlage_einfach, pct_wohnlage_mittel, pct_wohnlage_gut, dominant_wohnlage

Kitas
n_kitas, total_kita_capacity

Schools
Existing schools, quality rating: abitur_tier_bezirk (AMAZING/GOOD/OK/BAD), abitur_mn_scls_bezirk_avg, abitur_performance_vs_peer_bezirk_avg, n_abitur_schools_in_bezirk — covers schools with an Oberstufe only, not Grundschulen (see caveat below)
Schools being built/expanded: n_school_construction_projects, n_unique_schools_with_projects, total_planned_school_capacity — this is new/added capacity, not a quality signal

Safety
crime_total_avg_2017_2019

Air quality
nearest_air_station, air_station_distance_km, air_co_avg, air_no2_avg, air_o3_avg, air_pm10_avg, air_pm25_avg

Rent
rent_per_m2_kalt_avg_synthetic, n_rental_listings_synthetic

Buy price
buy_price_per_m2_avg_REAL, n_real_listings, buy_price_per_m2_avg_synthetic, n_synthetic_sales_listings

New housing supply
new_construction_price_per_m2_avg, n_new_construction_listings

Commute
nearest_transit_station, nearest_transit_line, transit_distance_km

//comments to data team:
"200+ locations": we have 193 PLZs.
Outside the Ring is Berlin's outer PLZs only. Brandenburg has no rent or school data; only web search can talk about it, unverified.
House-size guidance comes from web search, not structured data.
Listing and house photos: none. Wikimedia photos show the area, not flats.
Photo coverage may be partial.
BVG is a live dependency, with an estimate as fallback.
