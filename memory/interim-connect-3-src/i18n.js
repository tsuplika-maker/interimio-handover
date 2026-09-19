import { createContext, useContext, useEffect, useState } from "react";

const STRINGS = {
  de: {
    nav_managers: "Manager",
    nav_learn: "Lernen",
    nav_admin: "Admin",
    nav_login: "Login",
    nav_register: "Registrieren",
    nav_logout: "Logout",
    lang_toggle: "EN",

    hero_h1: "Interim Management. Schnell. Geprüft. Persönlich.",
    hero_sub: "Interimio verbindet Unternehmen mit erfahrenen Interim Managern für kritische Mandate, Vakanzen, Transformationen und Projekte. Finden Sie kurzfristig passende Führungskräfte — geprüft, verfügbar und mit echter Umsetzungserfahrung.",
    hero_tagline: "Europas digitale Plattform für Interim Management auf Augenhöhe.",
    hero_cta_find: "Manager finden",
    hero_cta_mandate: "Mandat einstellen",
    hero_cta_register: "Als Manager registrieren",

    barometer_title: "Das passiert gerade auf Interimio",
    barometer_eyebrow: "Marktbarometer · Live",
    barometer_freshness: "Daten aktualisieren bei jedem Seitenaufruf",
    barometer_active: "Aktive Interim-Manager",
    barometer_available: "Verfügbar diese Woche",
    barometer_avg_rate: "Ø Tagessatz",
    barometer_total_leads: "Mandatsanfragen insgesamt",

    // Company section
    company_section_eyebrow: "Für Unternehmen",
    company_section_title: "Die richtige Interim-Lösung, wenn es schnell gehen muss.",
    company_section_desc: "Ob Geschäftsführung auf Zeit, Finance, HR, Operations, Restrukturierung, Vertrieb oder Projektmanagement: Interimio bringt Sie schnell mit passenden Experten zusammen.",
    company_b1: "Geprüfte Interim Manager mit nachweisbarer Erfahrung",
    company_b2: "Schnelle Vorschläge statt langer Suchprozesse",
    company_b3: "Transparente Profile, Verfügbarkeit und Tagessätze",
    company_b4: "Direkter Austausch mit passenden Kandidaten",
    company_b5: "Ideal für Vakanzen, Wachstum, Krise und Transformation",
    company_cta: "Jetzt Mandat einstellen",

    // Manager section
    manager_section_eyebrow: "Für Interim Manager",
    manager_section_title: "Mehr passende Mandate. Weniger Streuverlust.",
    manager_section_desc: "Interimio macht Ihr Profil sichtbar für Unternehmen, die kurzfristig erfahrene Führungskräfte und Projektmanager suchen. Sie präsentieren Ihre Expertise, Verfügbarkeit, Branchenkenntnis und Tagessatz — und werden für passende Mandate gefunden.",
    manager_b1: "Sichtbarkeit bei Unternehmen mit konkretem Bedarf",
    manager_b2: "Professionelles Managerprofil",
    manager_b3: "Mandate passend zu Ihrer Erfahrung",
    manager_b4: "Direkter Kontakt ohne unnötige Umwege",
    manager_b5: "Flexible Mitgliedschaft monatlich oder jährlich",
    manager_cta: "Als Manager registrieren",

    // Quality section
    quality_eyebrow: "Qualität & Prüfung",
    quality_title: "Vertrauen ist die Basis jedes Mandats.",
    quality_desc: "Auf Interimio kommt nicht jeder rein. Jedes Manager-Profil wird auf Erfahrung, Referenzen und Verfügbarkeit geprüft. Unternehmen werden manuell freigeschaltet, damit Sie nur echte Anfragen bekommen.",
    quality_b1: "Profilprüfung jedes Managers vor Aktivierung",
    quality_b2: "Referenzen & nachweisbare Track-Records",
    quality_b3: "Manuelle Freischaltung jedes Unternehmens",
    quality_b4: "Klare Verfügbarkeit und Tagessätze — kein Vertrieb dazwischen",

    // How it works
    how_eyebrow: "So funktioniert es",
    how_title: "In vier Schritten zum passenden Mandat.",
    how_step1: "Mandat einstellen",
    how_step1_desc: "Beschreiben Sie kurz Bedarf, Branche, Skills und Tagessatz.",
    how_step2: "Passende Manager erhalten",
    how_step2_desc: "KI-gestütztes Matching mit den Top-Profilen aus unserer Datenbank.",
    how_step3: "Gespräch führen",
    how_step3_desc: "Direkter Austausch mit dem Wunschkandidaten — telefonisch oder per Video.",
    how_step4: "Mandat starten",
    how_step4_desc: "Vertrag, Onboarding, Start. Konditionen werden individuell mit Ihnen abgestimmt.",

    // Pricing
    pricing_eyebrow: "Mitgliedschaft für Interim Manager",
    pricing_title: "Professionelle Sichtbarkeit. Klare Konditionen.",
    pricing_monthly: "€129 netto / Monat",
    pricing_yearly: "€1.300 netto / Jahr",
    pricing_note: "Premium-Mitgliedschaft mit Profil, Mandatszugang, Lernplattform und Networking. Jederzeit kündbar.",

    // Categories
    categories_eyebrow: "Branchen & Funktionen",
    categories_title: "Geprüfte Expertise für jede Schlüsselrolle.",

    // Closing CTA
    closing_cta: "Starten Sie Ihr nächstes Mandat mit geprüfter Interim-Expertise.",
    closing_cta_btn: "Mandat einstellen",

    spotlight_eyebrow: "Manager des Monats",
    spotlight_cta: "Profil ansehen",

    dir_title: "Interim-Manager entdecken",
    dir_sub: "Suche nach Titel, Skills, Standort und Tagessatz.",

    pending_title: "Ihr Unternehmens-Account wird geprüft",
    pending_desc: "Unser Team meldet sich in Kürze telefonisch zur Freischaltung. So sichern wir die Qualität für alle Beteiligten.",

    footer_copy: "Der europäische Marktplatz für Interim-Management.",
  },
  en: {
    nav_managers: "Managers",
    nav_learn: "Learning",
    nav_admin: "Admin",
    nav_login: "Login",
    nav_register: "Register",
    nav_logout: "Logout",
    lang_toggle: "DE",

    hero_h1: "Interim management. Fast. Vetted. Personal.",
    hero_sub: "Interimio connects companies with experienced interim managers for critical mandates, vacancies, transformations and projects. Find executives at short notice — vetted, available, and with real delivery track records.",
    hero_tagline: "Europe's digital platform for interim management — eye-to-eye.",
    hero_cta_find: "Find managers",
    hero_cta_mandate: "Post a mandate",
    hero_cta_register: "Register as manager",

    barometer_title: "Live activity on Interimio",
    barometer_eyebrow: "Market barometer · Live",
    barometer_freshness: "Refreshes on every page load",
    barometer_active: "Active interim managers",
    barometer_available: "Available this week",
    barometer_avg_rate: "Avg. daily rate",
    barometer_total_leads: "Total mandate requests",

    company_section_eyebrow: "For companies",
    company_section_title: "The right interim solution when speed matters.",
    company_section_desc: "Whether interim general management, finance, HR, operations, restructuring, sales or project management: Interimio connects you quickly with the right experts.",
    company_b1: "Vetted interim managers with verifiable experience",
    company_b2: "Fast proposals instead of long search processes",
    company_b3: "Transparent profiles, availability and daily rates",
    company_b4: "Direct dialogue with relevant candidates",
    company_b5: "Ideal for vacancies, growth, crisis and transformation",
    company_cta: "Post a mandate",

    manager_section_eyebrow: "For interim managers",
    manager_section_title: "More relevant mandates. Less wasted reach.",
    manager_section_desc: "Interimio makes your profile visible to companies hiring experienced executives and project managers on short notice. You present your expertise, availability, sector know-how and daily rate — and get found for the right mandates.",
    manager_b1: "Visibility with companies that have concrete demand",
    manager_b2: "Professional manager profile",
    manager_b3: "Mandates that match your experience",
    manager_b4: "Direct contact without detours",
    manager_b5: "Flexible monthly or annual membership",
    manager_cta: "Register as manager",

    quality_eyebrow: "Quality & vetting",
    quality_title: "Trust is the foundation of every mandate.",
    quality_desc: "Not just anyone gets on Interimio. Every manager profile is reviewed for experience, references and availability. Companies are manually approved so you only receive serious requests.",
    quality_b1: "Profile review for every manager before activation",
    quality_b2: "References & verifiable track records",
    quality_b3: "Manual approval of every company",
    quality_b4: "Clear availability and daily rates — no sales in between",

    how_eyebrow: "How it works",
    how_title: "Four steps to the right mandate.",
    how_step1: "Post a mandate",
    how_step1_desc: "Briefly describe needs, sector, skills and daily rate.",
    how_step2: "Receive matches",
    how_step2_desc: "AI-driven matching with the top profiles from our database.",
    how_step3: "Talk",
    how_step3_desc: "Direct dialogue with the candidate — call or video.",
    how_step4: "Start the mandate",
    how_step4_desc: "Contract, onboarding, start. Conditions are agreed individually with you.",

    pricing_eyebrow: "Membership for interim managers",
    pricing_title: "Professional visibility. Clear terms.",
    pricing_monthly: "€129 net / month",
    pricing_yearly: "€1,300 net / year",
    pricing_note: "Premium membership with profile, mandate access, learning platform and networking. Cancel anytime.",

    categories_eyebrow: "Sectors & functions",
    categories_title: "Vetted expertise for every key role.",

    closing_cta: "Launch your next mandate with vetted interim expertise.",
    closing_cta_btn: "Post a mandate",

    spotlight_eyebrow: "Manager of the month",
    spotlight_cta: "View profile",

    dir_title: "Browse interim managers",
    dir_sub: "Search by title, skills, location and rate.",

    pending_title: "Your company account is being reviewed",
    pending_desc: "Our team will contact you shortly by phone to approve access. This guarantees quality for everyone on the platform.",

    footer_copy: "The European marketplace for interim management.",
  },
};

const I18nCtx = createContext({ lang: "de", t: (k) => k, setLang: () => {} });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("interimio_lang") || "de"; }
    catch { return "de"; }
  });
  useEffect(() => {
    try { localStorage.setItem("interimio_lang", lang); } catch {/* ignore */}
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);
  const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || (STRINGS.de[k]) || k;
  return <I18nCtx.Provider value={{ lang, t, setLang }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
