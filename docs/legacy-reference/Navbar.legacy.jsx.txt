"use client";
import { useState } from "react";
import useAuth from "../hooks/useAuth";

export default function Navbar() {
    const user = useAuth();
    const [vendorOpen, setVendorOpen] = useState(false);
    const [adminOpen, setAdminOpen] = useState(false);

    return (
        <nav className="w-full bg-neutral-900 border-b border-neutral-700 text-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">

                {/* Brand */}
                <Link href="/" className="text-xl font-semibold text-white">
                    ShahebBazar
                </Link>

                {/* Main navigation */}
                <div className="flex gap-6 text-sm items-center">

                    <Link href="/" className="hover:text-white">Home</Link>
                    <Link href="/search" className="hover:text-white">Search</Link>
                    <Link href="/businesses" className="hover:text-white">Businesses</Link>
                    <Link href="/categories" className="hover:text-white">Categories</Link>
                    <Link href="/categories" className="hover:text-white">
                        Categories
                    </Link>

                    {/* Messages */}
                    {user && (
                        <a href="/messages" className="hover:text-white">
                            Messages
                        </a>
                    )}

                    {/* Vendor Portal */}
                    <div className="relative">
                        <button
                            onClick={() => setVendorOpen(!vendorOpen)}
                            className="hover:text-white"
                        >
                            Vendor Portal ▾
                        </button>

                        {vendorOpen && (
                            <div className="absolute right-0 mt-2 bg-neutral-800 text-gray-200 rounded-md border border-neutral-700 w-56 p-2 flex flex-col">
                                <a href="/vendors/dashboard" className="p-2 hover:bg-neutral-700">Dashboard</a>
                                <a href="/vendors/dashboard/listings" className="p-2 hover:bg-neutral-700">Listings</a>
                                <a href="/vendors/dashboard/inquiries" className="p-2 hover:bg-neutral-700">Inquiries</a>
                                <a href="/vendors/dashboard/analytics" className="p-2 hover:bg-neutral-700">Analytics</a>
                                <a href="/vendors/dashboard/profile" className="p-2 hover:bg-neutral-700">Business Profile</a>
                                <a href="/vendors/dashboard/sponsorship" className="p-2 hover:bg-neutral-700">Sponsorship Tools</a>
                            </div>
                        )}
                    </div>

                    {/* Admin Portal */}
                    {user?.role === "admin" && (
                        <div className="relative">
                            <button
                                onClick={() => setAdminOpen(!adminOpen)}
                                className="hover:text-white"
                            >
                                Admin ▾
                            </button>

                            {adminOpen && (
                                <div className="absolute right-0 mt-2 bg-neutral-800 text-gray-200 rounded-md border border-neutral-700 w-56 p-2 flex flex-col">
                                    <a href="/admin/dashboard" className="p-2 hover:bg-neutral-700">Dashboard</a>
                                    <a href="/admin/approvals" className="p-2 hover:bg-neutral-700">Approvals</a>
                                    <a href="/admin/moderation" className="p-2 hover:bg-neutral-700">Moderation</a>
                                    <a href="/admin/analytics" className="p-2 hover:bg-neutral-700">Analytics</a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* User section */}
                    {user ? (
                        <>
                            <span className="opacity-90">Hi, {user.user_name}</span>
                            <a href="/profile" className="hover:text-white">Profile</a>

                            <button
                                onClick={() => {
                                    localStorage.removeItem("user");
                                    window.location.href = "/";
                                }}
                                className="hover:text-white"
                            >
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <a href="/login" className="hover:text-white">Login</a>
                            <a href="/register" className="hover:text-white">Register</a>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
