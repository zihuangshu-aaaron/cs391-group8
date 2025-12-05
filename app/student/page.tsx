"use client";

import mapboxgl from "mapbox-gl";

import React, { useState, useEffect, useRef } from "react";
import StudentNavBar from "./components/StudentNavBar";
import SearchBar from "./components/SearchBar";
import OrganizerCard from "./components/OrganizerCard";
import { upsertStudentProfile } from "@/lib/actions/upsertStudentProfile";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { geocodeLocation } from "@/lib/mapbox/geocoding";

import FilterChips from "./components/FilterChips";

interface Event {
  id: string;
  organizer_name: string;
  location: string;
  location_label: string;
  available_food: string;
  category: string;
  dietary_tags: string[];
  description?: string;
  featured_photo?: string;
  start_time: string;
  end_time: string;
  availability: string;
  created_at: string;
  lat?: number | null;
  lng?: number | null;
}

interface Organizer {
  id: string | number;
  name: string;
  location: string;
  locationLabel: string;
  availableFood: string;
  timeLeft: string;
  category: string;
  dietaryTags: string[];
  featuredPhoto?: string;
  description?: string;
}

// Calculate time left from end_time
const calculateTimeLeft = (endTime: string): string => {
  const now = new Date();
  const end = new Date(endTime);
  const diffMs = end.getTime() - now.getTime();
  
  if (diffMs < 0) {
    return "Ended";
  }
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  } else if (diffMins > 0) {
    return `${diffMins} min${diffMins === 1 ? "" : "s"}`;
  } else {
    return "Less than 1 min";
  }
};

// Convert Event API response to OrganizerCardProps format
const eventToOrganizer = (event: Event): Organizer => {
  return {
    id: event.id,
    name: event.organizer_name,
    location: event.location,
    locationLabel: event.location_label,
    availableFood: event.available_food,
    timeLeft: calculateTimeLeft(event.end_time),
    category: event.category,
    dietaryTags: event.dietary_tags || [],
    featuredPhoto: event.featured_photo,
    description: event.description,
  };
};

export default function StudentPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [availability, setAvailability] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [sorting, setSorting] = useState("");
  const [expandedOrganizerId, setExpandedOrganizerId] = useState<string | number | null>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();

      // Ensure Auth metadata has roles: ['student'] (or includes 'student')
      const ensureStudentRole = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const currentRoles: string[] = Array.isArray(user.user_metadata?.roles)
          ? (user.user_metadata.roles as string[])
          : [];

        if (!currentRoles.includes("student")) {
          await supabase.auth.updateUser({ data: { roles: [...currentRoles, "student"] } }).catch(() => {});
        }
      };

      // 1) If a session already exists, skip PKCE exchange
      const firstCheck = await supabase.auth.getUser();
      const existingUser = firstCheck.data.user;

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (existingUser) {
        // Clean stale OAuth params (avoid re-runs on refresh)
        if (code || state) {
          url.searchParams.delete("code");
          url.searchParams.delete("state");
          window.history.replaceState({}, "", url.toString());
        }

        // BU domain guard
        if (!existingUser.email?.toLowerCase().endsWith("@bu.edu")) {
          await supabase.auth.signOut();
          router.replace("/landing?authError=Please%20use%20a%20%40bu.edu%20account");
          return;
        }

        // Ensure role + student_profiles row
        await ensureStudentRole();
        try { await upsertStudentProfile(); } catch (e) { console.warn("student upsert failed:", e); }

        setEmail(existingUser.email ?? null);
        setReady(true);
        return;
      }

      // 2) No session yet → only attempt PKCE exchange if `code` is present
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // Try reading the user anyway (Supabase hosted callback might have set cookies)
          const retry = await supabase.auth.getUser();
          if (!retry.data.user) {
            router.replace(`/landing?authError=${encodeURIComponent(error.message)}`);
            return;
          }
        }
        // Clean URL after exchange so refreshes don’t re-run it
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.toString());
      }

      // 3) Final session check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/landing");
        return;
      }
      if (!user.email?.toLowerCase().endsWith("@bu.edu")) {
        await supabase.auth.signOut();
        router.replace("/landing?authError=Please%20use%20a%20%40bu.edu%20account");
        return;
      }

      // Ensure role + student_profiles row
      await ensureStudentRole();
      try { await upsertStudentProfile(); } catch (e) { console.warn("student upsert failed:", e); }

      setEmail(user.email ?? null);
      setReady(true);
    })();
  }, [router]);

  // Fetch events from API
  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/events", {
        credentials: "include",
      });
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch events");
      }
  
      // Geocode each event's location into lat/lng
      const enrichedEvents = await Promise.all(
        (data.events || []).map(async (event: Event) => {
          const coords = await geocodeLocation(event.location);
          console.log("Geocoded:", event.location, coords);
          return {
            ...event,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
          };
        })
      );
      console.log("Enriched events:", enrichedEvents);

      setEvents(enrichedEvents);
    } catch (err: any) {
      setError(err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // Refresh events every 30 seconds to update time left
    const interval = setInterval(() => {
      fetchEvents();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleCardClick = (organizerId: string | number) => {
    setExpandedOrganizerId(expandedOrganizerId === organizerId ? null : organizerId);
  };

  // Filter events: only show current events (end_time in future)
  const now = new Date();
  const currentEvents = events.filter((event) => new Date(event.end_time) >= now);

  // Convert to Organizer format
  const organizers = currentEvents.map(eventToOrganizer);

  // Filter organizers based on search and filters
  let filteredOrganizers = organizers.filter((organizer) => {
    const matchesSearch =
      searchQuery === "" ||
      organizer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      organizer.availableFood.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDietary =
      dietary.length === 0 ||
      dietary.some((diet) =>
        organizer.dietaryTags.some((tag) => {
          // Normalize both filter and tag for comparison
          const normalizedFilter = diet.toLowerCase().replace(/\s+/g, "-");
          const normalizedTag = tag.toLowerCase().replace(/\s+/g, "-");
          return normalizedTag === normalizedFilter || normalizedTag.includes(normalizedFilter);
        })
      );
    // Map availability filter to event availability
    const event = currentEvents.find((e) => e.id === organizer.id);
    const matchesAvailability = 
      availability === "" || 
      (event && event.availability === availability);

    const matchesLocation = location === "" || organizer.location === location;

    return matchesSearch && matchesDietary && matchesAvailability && matchesLocation;
  });

  // Sort organizers
  if (sorting !== "") {
    filteredOrganizers = [...filteredOrganizers].sort((a, b) => {
      const eventA = currentEvents.find((e) => e.id === a.id);
      const eventB = currentEvents.find((e) => e.id === b.id);
      
      if (!eventA || !eventB) return 0;

      switch (sorting) {
        case "newest":
          // Sort by created_at (newest first)
          return new Date(eventB.created_at).getTime() - new Date(eventA.created_at).getTime();
        case "ending-soon":
          // Sort by end_time (ending soon first)
          return new Date(eventA.end_time).getTime() - new Date(eventB.end_time).getTime();
        case "available-soon":
          // Sort by start_time (available soon first)
          return new Date(eventA.start_time).getTime() - new Date(eventB.start_time).getTime();
        default:
          return 0;
      }
    });
  }

// Filter events for the map component
const filteredEvents = currentEvents.filter((event) => {
  const matchesSearch =
    searchQuery === "" ||
    event.organizer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.available_food.toLowerCase().includes(searchQuery.toLowerCase());

  const matchesDietary =
    dietary.length === 0 ||
    dietary.some((diet) =>
      (event.dietary_tags || []).some((tag) => {
        const normalizedFilter = diet.toLowerCase().replace(/\s+/g, "-");
        const normalizedTag = tag.toLowerCase().replace(/\s+/g, "-");
        return normalizedTag === normalizedFilter || normalizedTag.includes(normalizedFilter);
      })
    );

  const matchesAvailability =
    availability === "" || event.availability === availability;

  const matchesLocation =
    location === "" || event.location === location;

  return matchesSearch && matchesDietary && matchesAvailability && matchesLocation;
});

  return (
    <div className="min-h-screen w-full bg-[#f9f8f4]">
      <StudentNavBar />
      
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Top Section - Search and Filters */}
        <div className="mb-8">
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            availability={availability}
            onAvailabilityChange={setAvailability}
            dietary={dietary}
            onDietaryChange={setDietary}
            location={location}
            onLocationChange={setLocation}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center">
            <p className="text-xl font-semibold text-emerald-900">Loading events...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-[20px] border-[2px] border-red-500 bg-red-50 p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Main Section - Organizer Cards List */}
        {!loading && (
          <>
            {filteredOrganizers.length > 0 ? (
              <div className="space-y-4">
                {filteredOrganizers.map((organizer) => (
                  <OrganizerCard
                    key={organizer.id}
                    organizer={organizer}
                    isExpanded={expandedOrganizerId === organizer.id}
                    onClick={() => handleCardClick(organizer.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
                  <p className="text-xl font-semibold text-emerald-900">
                    {events.length === 0
                      ? "No events available. Check back later!"
                      : "No events found matching your search."}
                  </p>
                </div>
              </div>
            )}

            {/* Map Section */}
            <div className="mt-12">
            <StudentMap events={filteredEvents} />

            </div>

          </>
        )}
      </main>
    </div>
  );
}

export function StudentMap({ events }: { events: Event[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // initialize map once
  useEffect(() => {
    if (map.current || !mapboxToken) return;
    
    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [-71.1054, 42.3505], // BU campus default
      zoom: 14,
    });
  }, [mapboxToken]);

  // add markers when events change
  useEffect(() => {
    if (!map.current) return;

    // clear old markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const now = new Date();
    const activeEvents = events.filter(e => new Date(e.end_time) > now);

    const bounds = new mapboxgl.LngLatBounds();

    activeEvents.forEach(event => {
      if (event.lat && event.lng) {
        const marker = new mapboxgl.Marker()
          .setLngLat([event.lng, event.lat])
          .setPopup(
            new mapboxgl.Popup().setHTML(`
              <strong>${event.organizer_name}</strong><br/>
              🍴 ${event.available_food}<br/>
              ⏰ ${calculateTimeLeft(event.end_time)}
            `)
          )
          .addTo(map.current!);

        markers.current.push(marker);
        bounds.extend([event.lng, event.lat]);
      }
    });

    if (!bounds.isEmpty() && activeEvents.length > 1) {
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [events]);

  // If no Mapbox token, show a placeholder
  if (!mapboxToken) {
    return (
      <div style={{ height: "500px", width: "100%" }} className="flex items-center justify-center rounded-lg border-2 border-emerald-900/20 bg-emerald-50">
        <p className="text-center text-emerald-900">
          Map view requires a Mapbox access token.<br />
          <span className="text-sm text-emerald-700">Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file</span>
        </p>
      </div>
    );
  }

  return <div ref={mapContainer} style={{ height: "500px", width: "100%" }} />;
}


