import React from "react";
import Link from "next/link";
import {
  getPostAuthor,
  CATEGORY_LABELS,
  REGION_LABELS,
  COMPENSATION_LABELS,
  getPostMatchStatus,
} from "../lib/data.js";
import { resolveAvatarSrc } from "../lib/avatars.js";

export function PostCard({ post, index }) {
  const author = getPostAuthor(post);
  const isHighlight = index === 1;
  const authorAvatar = resolveAvatarSrc({ key: author.avatarKey, url: author.avatar });
  const authorInitial = (author.initial || author.name || "N").charAt(0).toUpperCase();
  const matchStatus = getPostMatchStatus(post);

  return (
    <article className={`request-card${isHighlight ? " highlight-card" : ""}`}>
      <header className="card-user">
        <Link href={`/pengguna/${encodeURIComponent(author.id)}`} className="card-user-profile" aria-label={`Lihat profil dan ulasan ${author.name}`}>
          {authorAvatar ? (
            <img src={authorAvatar} alt="" width={36} height={36} className="avatar-img" />
          ) : (
            <span className="avatar-img card-user-initial" aria-hidden="true">{authorInitial}</span>
          )}
          <span className="user-info">
            <strong>{author.name}</strong>
            <small title={post.address || undefined}>
              {post.timeLabel || "Baru saja"} &bull;{" "}
              {[REGION_LABELS[post.region] || post.region, post.address].filter(Boolean).join(" · ")}
            </small>
          </span>
        </Link>
      </header>
      <h4>
        <Link href={`/detail-postingan?id=${encodeURIComponent(post.id)}`}>
          {post.title}
        </Link>
      </h4>
      <p>{post.summary}</p>
      <div className="tags">
        {matchStatus !== "open" && (
          <span className={`tag match-badge match-badge-${matchStatus}`}>
            {matchStatus === "selesai" ? "Pernah match" : "Sudah match"}
          </span>
        )}
        <span className="tag">
          {CATEGORY_LABELS[post.category] || post.category}
        </span>
        <span className="tag">
          {COMPENSATION_LABELS[post.compensation] || post.compensation}
        </span>
      </div>
    </article>
  );
}
