import { Routes, Route, useLocation, Navigate } from "react-router-dom";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

import Home from "./pages/Home";
import Search from "./pages/Search";
import Membership from "./pages/Membership";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import Profiles from "./pages/Profile";
import PublicProfileDetails from "./pages/ProfileDetails";

import RegistrationDetails from "./pages/RegistrationDetails1";
import RegistrationStep3 from "./pages/RegistrationD3";

import NotFound from "./pages/NotFound";

// Admin
import AdminLogin from "./pages/Admin/AdminLogin";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import RegistrationReview from "./pages/Admin/RegistrationReview";

// Client
import ClientDashboard from "./pages/ClientDashboard";
import MyProfile from "./pages/Client/MyProfile";
import EditProfile from "./pages/Client/EditProfile";
import SearchMatches from "./pages/Client/SearchMatches";
import ClientProfileDetails from "./pages/Client/ProfileDetails";
import Interests from "./pages/Client/Interests";
import Shortlist from "./pages/Client/Shortlist";
import Messages from "./pages/Client/Messages";
import MyPhotos from "./pages/Client/MyPhotos";
import Settings from "./pages/Client/Settings";

import "./App.css";


function AppLayout() {
  const location = useLocation();

  const clientRoutes = [
    "/dashboard",
    "/profile",
    "/search-matches",
    "/interests",
    "/shortlist",
    "/messages",
    "/photos",
    "/settings"
  ];

  // Client subpages have their own dashboard layout
  const isClientDashboard = clientRoutes.some(
    route => location.pathname === route || location.pathname.startsWith(route + "/")
  );

  // Admin pages have their own layout
  const isAdminPage = location.pathname.startsWith("/admin");

  const hideMainNavbar = isAdminPage;
  const hideFooter = isClientDashboard || isAdminPage;

  return (
    <div className="App">

      {/* Normal website Navbar */}
      {!hideMainNavbar && <Navbar />}

      <main>
        <Routes>

          {/* =========================
              PUBLIC PAGES
          ========================= */}

          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/membership" element={<Membership />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/login" element={<Login />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/profiles/:id" element={<PublicProfileDetails />} />

          {/* Registration Steps */}
          <Route path="/registration-details" element={<RegistrationDetails />} />
          <Route path="/registration-details3" element={<RegistrationStep3 />} />

          {/* =========================
              ADMIN
          ========================= */}

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminOnlyRoute><AdminDashboard /></AdminOnlyRoute>} />
          <Route path="/admin/view/:id" element={<AdminOnlyRoute><RegistrationReview /></AdminOnlyRoute>} />

          {/* =========================
              CLIENT
          ========================= */}

          <Route path="/dashboard" element={<ClientOnlyRoute><ClientDashboard /></ClientOnlyRoute>} />
          <Route path="/profile" element={<ClientOnlyRoute><MyProfile /></ClientOnlyRoute>} />
          <Route path="/profile/edit" element={<ClientOnlyRoute><EditProfile /></ClientOnlyRoute>} />
          <Route path="/search-matches" element={<ClientOnlyRoute><SearchMatches /></ClientOnlyRoute>} />
          <Route path="/search-matches/:id" element={<ClientOnlyRoute><ClientProfileDetails /></ClientOnlyRoute>} />
          <Route path="/interests" element={<ClientOnlyRoute><Interests /></ClientOnlyRoute>} />
          <Route path="/shortlist" element={<ClientOnlyRoute><Shortlist /></ClientOnlyRoute>} />
          <Route path="/messages" element={<ClientOnlyRoute><Messages /></ClientOnlyRoute>} />
          <Route path="/photos" element={<ClientOnlyRoute><MyPhotos /></ClientOnlyRoute>} />
          <Route path="/settings" element={<ClientOnlyRoute><Settings /></ClientOnlyRoute>} />

          {/* =========================
              404 (MUST BE LAST)
          ========================= */}

          <Route path="*" element={<NotFound />} />

        </Routes>
      </main>

      {/* Normal website Footer */}
      {!hideFooter && <Footer />}

    </div>
  );
}

function ClientOnlyRoute({ children }) {
  if (!localStorage.getItem("access_token")) {
    return <Navigate to="/login" replace />;
  }

  let role;
  try {
    role = JSON.parse(localStorage.getItem("user") || "null")?.role;
  } catch {
    return <Navigate to="/login" replace />;
  }

  if (role === "CLIENT") return children;
  if (role === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
  if (role === "BROKER") return <Navigate to="/broker/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

function AdminOnlyRoute({ children }) {
  if (!localStorage.getItem("access_token")) {
    return <Navigate to="/admin/login" replace />;
  }

  try {
    const storedUser = JSON.parse(
      localStorage.getItem("admin_user") || localStorage.getItem("user") || "null",
    );
    if (storedUser?.role === "ADMIN") return children;
  } catch {
    return <Navigate to="/admin/login" replace />;
  }

  return <Navigate to="/admin/login" replace />;
}


export default function App() {
  return <AppLayout />;
}
