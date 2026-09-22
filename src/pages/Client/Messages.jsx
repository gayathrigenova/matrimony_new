import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./Messages.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetProfileId = searchParams.get("profile");

  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputContent, setInputContent] = useState("");
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef(null);
  const token = localStorage.getItem("access_token");

  // Load conversations list
  const fetchConversations = () => {
    fetch(`${API_URL}/registrations/conversations/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list = data.results || data || [];
        setConversations(list);

        // If target profile query param passed, start or select conversation
        if (targetProfileId && list.length > 0) {
          const existing = list.find(
            (c) => c.other_participant?.profile_id === parseInt(targetProfileId)
          );
          if (existing) {
            setSelectedConvId(existing.id);
          }
        } else if (list.length > 0 && !selectedConvId) {
          setSelectedConvId(list[0].id);
        }
      })
      .catch((err) => console.error("Conversations error:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchConversations();
  }, [token, navigate]);

  // Load active conversation messages
  useEffect(() => {
    if (!selectedConvId) return;

    fetch(`${API_URL}/registrations/conversations/${selectedConvId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setActiveConv(data.conversation);
          setMessages(data.messages || []);
        }
      })
      .catch((err) => console.error("Messages load error:", err));
  }, [selectedConvId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputContent.trim() || !selectedConvId) return;

    const content = inputContent.trim();
    setInputContent("");

    fetch(`${API_URL}/registrations/conversations/${selectedConvId}/send/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((newMsg) => {
        if (newMsg) {
          setMessages((prev) => [...prev, newMsg]);
          fetchConversations();
        }
      })
      .catch((err) => alert("Failed to send message."));
  };

  return (
    <ClientLayout>
      <div className="messages-container">
        <div className="messages-header">
          <h1>Messages</h1>
          <p>Communicate directly with interested and connected matrimony members.</p>
        </div>

        <div className="messages-layout">
          {/* SIDEBAR LIST */}
          <div className="conversations-sidebar">
            <div className="conversations-sidebar-title">
              Conversations ({conversations.length})
            </div>
            <div className="conversations-list">
              {loading ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                  Loading conversations...
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)" }}>
                  No messages yet.
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`conversation-item ${selectedConvId === conv.id ? "active" : ""}`}
                    onClick={() => setSelectedConvId(conv.id)}
                  >
                    <div className="conv-avatar">
                      {conv.other_participant?.photo_url ? (
                        <img
                          src={conv.other_participant.photo_url}
                          alt={conv.other_participant.full_name}
                        />
                      ) : (
                        conv.other_participant?.full_name?.charAt(0)?.toUpperCase() || "U"
                      )}
                    </div>
                    <div className="conv-info">
                      <div className="conv-top-line">
                        <span className="conv-name">
                          {conv.other_participant?.full_name || "Member"}
                        </span>
                        {conv.last_message && (
                          <span className="conv-time">
                            {new Date(conv.last_message.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="conv-last-msg">
                        {conv.last_message ? conv.last_message.content : "Start conversation..."}
                      </div>
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="unread-badge">{conv.unread_count}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CHAT MAIN WINDOW */}
          {selectedConvId && activeConv ? (
            <div className="chat-window">
              <div className="chat-header">
                <div className="conv-avatar">
                  {activeConv.other_participant?.photo_url ? (
                    <img
                      src={activeConv.other_participant.photo_url}
                      alt={activeConv.other_participant.full_name}
                    />
                  ) : (
                    activeConv.other_participant?.full_name?.charAt(0)?.toUpperCase() || "U"
                  )}
                </div>
                <div>
                  <h3>{activeConv.other_participant?.full_name}</h3>
                  <p>Matrimony ID: {activeConv.other_participant?.matrimony_id || "-"}</p>
                </div>
              </div>

              <div className="messages-stream">
                {messages.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--muted)", margin: "auto" }}>
                    Say hello to start the conversation!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`message-bubble-wrapper ${msg.is_me ? "sent" : "received"}`}
                    >
                      <div className="message-bubble">{msg.content}</div>
                      <span className="message-time">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                />
                <button type="submit" className="btn-send-message">
                  Send
                </button>
              </form>
            </div>
          ) : (
            <div className="no-chat-selected">
              <h3>Select a conversation</h3>
              <p>Choose a member from the sidebar to view your message history.</p>
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
