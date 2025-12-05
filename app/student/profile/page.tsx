"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import StudentNavBar from "../components/StudentNavBar";
import VendorNavBar from "../../vendor/components/VendorNavBar";
import Image from "next/image";
import Link from "next/link";

interface StudentProfile {
  id: string;
  email?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  major?: string;
  year?: string;
  dietary_preferences?: string[];
  notification_enabled?: boolean;
  created_at?: string;
}

interface VendorProfile {
  id: string;
  email?: string;
  org_name?: string;
  contact_email?: string;
  website?: string;
  description?: string;
  avatar_url?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

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
}

type TabType = "profile" | "statistics" | "settings";

const MAJOR_OPTIONS = [
  "Computer Science",
  "Business",
  "Engineering",
  "Arts & Sciences",
  "Communications",
  "Education",
  "Fine Arts",
  "Health Sciences",
  "Other",
];

const YEAR_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate", "Other"];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userType, setUserType] = useState<"student" | "vendor" | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [userId, setUserId] = useState<string | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<Date | null>(null);

  // Student profile state
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [studentForm, setStudentForm] = useState({
    display_name: "",
    bio: "",
    major: "",
    year: "",
    dietary_preferences: [] as string[],
    notification_enabled: true,
  });

  // Vendor profile state
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [vendorForm, setVendorForm] = useState({
    org_name: "",
    contact_email: "",
    website: "",
    description: "",
  });

  // Statistics state
  const [vendorStats, setVendorStats] = useState({
    totalEvents: 0,
    currentEvents: 0,
    pastEvents: 0,
  });
  const [vendorEvents, setVendorEvents] = useState<Event[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();

      // Get user
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        router.replace("/landing");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? null);
      setAccountCreatedAt(user.created_at ? new Date(user.created_at) : null);

      // Determine user type from roles
      const roles: string[] = Array.isArray(user.user_metadata?.roles)
        ? (user.user_metadata.roles as string[])
        : [];

      if (roles.includes("vendor") || roles.includes("organizer")) {
        setUserType("vendor");
        // Fetch vendor profile
        const { data: vendorData, error: vendorErr } = await supabase
          .from("vendor_profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (!vendorErr && vendorData) {
          setVendorProfile(vendorData);
          setVendorForm({
            org_name: vendorData.org_name || "",
            contact_email: vendorData.contact_email || user.email || "",
            website: vendorData.website || "",
            description: vendorData.description || "",
          });

          // Fetch vendor events for statistics
          const { data: eventsData } = await supabase
            .from("events")
            .select("*")
            .eq("organizer_id", user.id)
            .order("created_at", { ascending: false });

          if (eventsData) {
            const now = new Date();
            const currentEvents = eventsData.filter(
              (e) => new Date(e.end_time) >= now
            );
            const pastEvents = eventsData.filter((e) => new Date(e.end_time) < now);

            setVendorEvents(eventsData.slice(0, 10)); // Last 10 events
            setVendorStats({
              totalEvents: eventsData.length,
              currentEvents: currentEvents.length,
              pastEvents: pastEvents.length,
            });
          }
        }
      } else {
        // Default to student
        setUserType("student");
        // Fetch student profile
        const { data: studentData, error: studentErr } = await supabase
          .from("student_profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (!studentErr && studentData) {
          setStudentProfile(studentData);
          setStudentForm({
            display_name: studentData.display_name || "",
            bio: studentData.bio || "",
            major: studentData.major || "",
            year: studentData.year || "",
            dietary_preferences: studentData.dietary_preferences || [],
            notification_enabled: studentData.notification_enabled ?? true,
          });
        }
      }

      setLoading(false);
    })();
  }, [router]);

  const handleAvatarUpload = async (file: File) => {
    if (!userId) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = supabaseBrowser();

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Update profile
      const tableName = userType === "vendor" ? "vendor_profiles" : "student_profiles";
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      if (userType === "vendor") {
        setVendorProfile({ ...vendorProfile!, avatar_url: publicUrl });
      } else {
        setStudentProfile({ ...studentProfile!, avatar_url: publicUrl });
      }

      setSuccess("Avatar updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleStudentSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/landing");
        return;
      }

      const { error: updateErr } = await supabase
        .from("student_profiles")
        .upsert(
          {
            id: user.id,
            display_name: studentForm.display_name.trim() || null,
            bio: studentForm.bio.trim() || null,
            major: studentForm.major.trim() || null,
            year: studentForm.year.trim() || null,
            dietary_preferences: studentForm.dietary_preferences.length > 0
              ? studentForm.dietary_preferences
              : null,
            notification_enabled: studentForm.notification_enabled,
          },
          { onConflict: "id" }
        );

      if (updateErr) throw updateErr;

      setStudentProfile({
        ...(studentProfile || { id: user.id }),
        display_name: studentForm.display_name.trim() || undefined,
        bio: studentForm.bio.trim() || undefined,
        major: studentForm.major.trim() || undefined,
        year: studentForm.year.trim() || undefined,
        dietary_preferences:
          studentForm.dietary_preferences.length > 0
            ? studentForm.dietary_preferences
            : undefined,
        notification_enabled: studentForm.notification_enabled,
      });
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleVendorSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/landing");
        return;
      }

      const orgName = vendorForm.org_name.trim();
      const contactEmail = vendorForm.contact_email.trim() || user.email;
      const description = vendorForm.description.trim();
      const website = vendorForm.website.trim();

      if (!orgName || !description) {
        setError("Organization name and description are required");
        setSaving(false);
        return;
      }

      // Normalize website URL
      const normalizedWebsite =
        website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;

      const { error: updateErr } = await supabase
        .from("vendor_profiles")
        .upsert(
          {
            id: user.id,
            org_name: orgName,
            contact_email: contactEmail,
            website: normalizedWebsite || null,
            description: description,
          },
          { onConflict: "id" }
        );

      if (updateErr) throw updateErr;

      setVendorProfile({
        ...(vendorProfile || { id: user.id }),
        org_name: orgName,
        contact_email: contactEmail,
        website: normalizedWebsite || undefined,
        description: description,
      });
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const toggleDietaryPreference = (pref: string) => {
    setStudentForm((prev: typeof studentForm) => ({
      ...prev,
      dietary_preferences: prev.dietary_preferences.includes(pref)
        ? prev.dietary_preferences.filter((p: string) => p !== pref)
        : [...prev.dietary_preferences, pref],
    }));
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#f9f8f4]">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-xl font-semibold text-emerald-900">Loading profile...</p>
        </div>
      </div>
    );
  }

  const NavBar = userType === "vendor" ? VendorNavBar : StudentNavBar;
  const avatarUrl =
    userType === "vendor"
      ? vendorProfile?.avatar_url
      : studentProfile?.avatar_url;

  return (
    <div className="min-h-screen w-full bg-[#f9f8f4]">
      <NavBar />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1
          className="mb-8 text-4xl font-black uppercase tracking-wide text-emerald-900"
          style={{ fontFamily: "var(--font-display)" }}
        >
          My Profile
        </h1>

        {/* Success Message */}
        {success && (
          <div className="mb-6 rounded-[20px] border-[2px] border-green-500 bg-green-50 p-4">
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-[20px] border-[2px] border-red-500 bg-red-50 p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-3 border-b-2 border-emerald-900">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-6 py-3 text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === "profile"
                ? "border-b-4 border-emerald-900 text-emerald-900"
                : "text-emerald-700 hover:text-emerald-900"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab("statistics")}
            className={`px-6 py-3 text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === "statistics"
                ? "border-b-4 border-emerald-900 text-emerald-900"
                : "text-emerald-700 hover:text-emerald-900"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === "settings"
                ? "border-b-4 border-emerald-900 text-emerald-900"
                : "text-emerald-700 hover:text-emerald-900"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            Settings
          </button>
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
              <div className="flex items-center gap-6">
                <div className="relative h-32 w-32 flex-shrink-0">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile Avatar"
                      fill
                      className="rounded-full object-cover border-[3px] border-emerald-900"
                    />
                  ) : (
                    <div className="h-full w-full rounded-full bg-emerald-100 border-[3px] border-emerald-900 flex items-center justify-center text-4xl font-black text-emerald-900">
                      {email?.[0].toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h2
                    className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {userType === "vendor"
                      ? vendorProfile?.org_name || "Vendor"
                      : studentProfile?.display_name || email?.split("@")[0] || "Student"}
                  </h2>
                  <p className="text-gray-600 mb-4">{email}</p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                      }}
                      disabled={uploading}
                    />
                    <span className="inline-block rounded-full border-[3px] border-emerald-900 bg-[#BBF7D0] px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-900 shadow-[0_3px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_4px_0_0_rgba(16,78,61,0.5)] hover:bg-[#86EFAC] active:translate-y-0 disabled:opacity-60">
                      {uploading ? "Uploading..." : "Change Avatar"}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Student Profile Form */}
            {userType === "student" && (
              <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
                <h2
                  className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Personal Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={studentForm.display_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setStudentForm({ ...studentForm, display_name: e.target.value })
                      }
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      placeholder="Enter your display name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Email
                    </label>
                    <p className="text-emerald-900 py-2">{email || "N/A"}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                        Major
                      </label>
                      <select
                        value={studentForm.major}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          setStudentForm({ ...studentForm, major: e.target.value })
                        }
                        className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      >
                        <option value="">Select major</option>
                        {MAJOR_OPTIONS.map((major) => (
                          <option key={major} value={major}>
                            {major}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                        Year
                      </label>
                      <select
                        value={studentForm.year}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          setStudentForm({ ...studentForm, year: e.target.value })
                        }
                        className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      >
                        <option value="">Select year</option>
                        {YEAR_OPTIONS.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Bio
                    </label>
                    <textarea
                      value={studentForm.bio}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStudentForm({ ...studentForm, bio: e.target.value })}
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      rows={4}
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Dietary Preferences
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Vegetarian",
                        "Vegan",
                        "Gluten-Free",
                        "Dairy-Free",
                        "Nut-Free",
                        "Halal",
                        "Kosher",
                      ].map((pref) => (
                        <button
                          key={pref}
                          type="button"
                          onClick={() => toggleDietaryPreference(pref)}
                          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                            studentForm.dietary_preferences.includes(pref)
                              ? "bg-emerald-900 text-white border-2 border-emerald-900"
                              : "bg-white text-emerald-900 border-2 border-emerald-900 hover:bg-emerald-50"
                          }`}
                        >
                          {pref}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      onClick={handleStudentSave}
                      disabled={saving}
                      className="rounded-full border-[3px] border-emerald-900 bg-[#BBF7D0] px-6 py-3 text-sm font-black uppercase tracking-wider text-emerald-900 shadow-[0_5px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_0_rgba(16,78,61,0.5)] hover:bg-[#86EFAC] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Profile Form */}
            {userType === "vendor" && (
              <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
                <h2
                  className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Organization Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Organization Name *
                    </label>
                    <input
                      type="text"
                      value={vendorForm.org_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setVendorForm({ ...vendorForm, org_name: e.target.value })
                      }
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      placeholder="Enter organization name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Contact Email *
                    </label>
                    <input
                      type="email"
                      value={vendorForm.contact_email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setVendorForm({ ...vendorForm, contact_email: e.target.value })
                      }
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      placeholder="contact@bu.edu"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      value={vendorForm.website}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setVendorForm({ ...vendorForm, website: e.target.value })
                      }
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      placeholder="https://example.org"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Description *
                    </label>
                    <textarea
                      value={vendorForm.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setVendorForm({ ...vendorForm, description: e.target.value })
                      }
                      className="w-full px-4 py-3 border-[2px] rounded-[20px] text-emerald-900 placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 border-emerald-300"
                      rows={5}
                      placeholder="Tell students who you are, what events you run, and the kinds of food you'll post."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black uppercase tracking-wide text-emerald-900 mb-2">
                      Status
                    </label>
                    <p className="text-emerald-900">
                      {vendorProfile?.is_active ? (
                        <span className="text-green-600 font-black">Active</span>
                      ) : (
                        <span className="text-emerald-600">Inactive</span>
                      )}
                    </p>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      onClick={handleVendorSave}
                      disabled={saving}
                      className="rounded-full border-[3px] border-emerald-900 bg-[#BBF7D0] px-6 py-3 text-sm font-black uppercase tracking-wider text-emerald-900 shadow-[0_5px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_0_rgba(16,78,61,0.5)] hover:bg-[#86EFAC] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Statistics Tab */}
        {activeTab === "statistics" && (
          <div className="space-y-6">
            {/* Account Info */}
            <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
              <h2
                className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Account Information
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-emerald-200">
                  <span className="font-black uppercase tracking-wide text-emerald-900">Member Since</span>
                  <span className="text-emerald-900">{formatDate(accountCreatedAt)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-emerald-200">
                  <span className="font-black uppercase tracking-wide text-emerald-900">Email</span>
                  <span className="text-emerald-900">{email || "N/A"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-emerald-200">
                  <span className="font-black uppercase tracking-wide text-emerald-900">Account Type</span>
                  <span className="text-emerald-900 uppercase">{userType || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* Vendor Statistics */}
            {userType === "vendor" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-6 shadow-[0_5px_0_0_rgba(16,78,61,0.3)] text-center">
                    <div className="text-4xl font-black text-emerald-900 mb-2">
                      {vendorStats.totalEvents}
                    </div>
                    <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">
                      Total Events
                    </div>
                  </div>
                  <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-6 shadow-[0_5px_0_0_rgba(16,78,61,0.3)] text-center">
                    <div className="text-4xl font-black text-emerald-900 mb-2">
                      {vendorStats.currentEvents}
                    </div>
                    <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">
                      Current Events
                    </div>
                  </div>
                  <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-6 shadow-[0_5px_0_0_rgba(16,78,61,0.3)] text-center">
                    <div className="text-4xl font-black text-emerald-900 mb-2">
                      {vendorStats.pastEvents}
                    </div>
                    <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">
                      Past Events
                    </div>
                  </div>
                </div>

                {/* Recent Events */}
                {vendorEvents.length > 0 && (
                  <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
                    <h2
                      className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Recent Events
                    </h2>
                    <div className="space-y-3">
                      {vendorEvents.map((event: Event) => {
                        const isPast = new Date(event.end_time) < new Date();
                        return (
                          <Link
                            key={event.id}
                            href="/vendor"
                            className="block p-4 rounded-lg border-2 border-emerald-200 hover:border-emerald-900 hover:bg-emerald-50 transition-all"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h3 className="font-bold text-emerald-900 mb-1">
                                  {event.organizer_name}
                                </h3>
                                <p className="text-sm text-gray-600">{event.available_food}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(event.start_time).toLocaleDateString()} -{" "}
                                  {new Date(event.end_time).toLocaleDateString()}
                                </p>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  isPast
                                    ? "bg-gray-200 text-gray-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {isPast ? "Past" : "Active"}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Student Statistics Placeholder */}
            {userType === "student" && (
              <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)] text-center">
                <p className="text-gray-600">
                  Activity statistics will appear here as you use SparkBytes!
                </p>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* Notification Settings */}
            {userType === "student" && (
              <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
                <h2
                  className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Notification Settings
                </h2>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={studentForm.notification_enabled}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setStudentForm({
                          ...studentForm,
                          notification_enabled: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-2 border-emerald-900 text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="font-black uppercase tracking-wide text-emerald-900">
                      Enable email notifications for new events
                    </span>
                  </label>
                  <button
                    onClick={handleStudentSave}
                    disabled={saving}
                    className="rounded-full border-[3px] border-emerald-900 bg-[#BBF7D0] px-6 py-3 text-sm font-black uppercase tracking-wider text-emerald-900 shadow-[0_5px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_0_rgba(16,78,61,0.5)] hover:bg-[#86EFAC] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-[30px] border-[3px] border-emerald-900 bg-white p-8 shadow-[0_5px_0_0_rgba(16,78,61,0.3)]">
              <h2
                className="text-2xl font-black uppercase tracking-wide text-emerald-900 mb-6"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Quick Actions
              </h2>
              <div className="space-y-3">
                {userType === "vendor" && (
                  <Link
                    href="/vendor/create"
                    className="block w-full rounded-full border-[3px] border-emerald-900 bg-[#BBF7D0] px-6 py-3 text-center text-sm font-black uppercase tracking-wider text-emerald-900 shadow-[0_5px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_0_rgba(16,78,61,0.5)] hover:bg-[#86EFAC] active:translate-y-0"
                  >
                    Create New Event
                  </Link>
                )}
                <Link
                  href={userType === "vendor" ? "/vendor" : "/student"}
                  className="block w-full rounded-full border-[3px] border-emerald-900 bg-white px-6 py-3 text-center text-sm font-black uppercase tracking-wider text-emerald-900 shadow-[0_5px_0_0_rgba(16,78,61,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_7px_0_0_rgba(16,78,61,0.5)] active:translate-y-0"
                >
                  {userType === "vendor" ? "View My Events" : "Browse Events"}
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
