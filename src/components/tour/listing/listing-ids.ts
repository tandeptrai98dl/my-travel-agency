// Element ids shared by the listing's server and client components. Kept out of the "use client"
// modules: a constant imported from one into a server component would be a client reference, not
// the string.
export const LISTING_FORM_ID = "tour-search";
export const FILTER_PANEL_ID = "tour-filters";
