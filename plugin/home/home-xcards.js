// Home X post cards: "the gap" complaint card and the field-poll card
// with Jeff Lindsay's reply. Split from home-sections.js so the two
// big cards stay under 50 lines each.

import React from "react";
import { fieldPoll } from "./home-data.js";
import htm from "htm";

const html = htm.bind(React.createElement);

function XCardHeader({ initials, name, check, handle, href, ariaLabel }) {
  return html`
    <header className="mkt-x-head">
      <span className="mkt-x-avatar" aria-hidden=${true}>${initials}</span>
      <div className="mkt-x-meta">
        <div className="mkt-x-name">
          <strong>${name}</strong>
          ${check &&
            html`<span className="mkt-x-check" aria-label="verified" title="verified">✓</span>`}
        </div>
        <div className="mkt-x-handle">${handle}</div>
      </div>
      <a
        className="mkt-x-link"
        href=${href}
        target="_blank"
        rel="noopener"
        aria-label=${ariaLabel}
      >↗</a>
    </header>
  `;
}

export function HomeGapXCard() {
  return html`
    <section className="mkt-page mkt-section" id="mkt-gap">
      <div className="mkt-section-label">THE GAP</div>
      <h2>Another agent. Another uninstall.</h2>
      <p className="lead">The market knows it. Here is one of the louder complaints we have been hearing:</p>
      <article className="mkt-x-card">
        <${XCardHeader}
          initials="ZH"
          name="Zachary_haha"
          handle="@Zachary_haha"
          href="https://x.com/Zachary_haha/status/2084644286042198287"
          ariaLabel="Open original post on X"
        />
        <p className="mkt-x-body">好久都没看到什么新的有意思的产品了，天天看到的就是，又有一堆人出了一个Agent，然后用一下发现一坨屎，卸载，然后另一堆人出了另一个Agent，用一下发现又是一坨屎，在卸载。然后在电脑里拉的.xxxx文件夹的还得手动清理。。。真就没啥让人耳目一新的玩意儿。。。。</p>
      </article>
    </section>
  `;
}

function FieldPoll() {
  return html`
    <div className="mkt-x-poll" aria-label="Poll results">
      ${fieldPoll.map((row) =>
        html`
          <div className="mkt-x-poll-row" key=${row.label}>
            <span className="mkt-x-poll-label">${row.label}</span>
            <span className="mkt-x-poll-bar-wrap">
              <span className="mkt-x-poll-bar" style=${{ width: row.pct }}></span>
            </span>
            <span className="mkt-x-poll-pct">${row.pct}</span>
          </div>
        `,
      )}
      <div className="mkt-x-poll-foot">2,101 votes · Final results</div>
    </div>
  `;
}

function FieldReply() {
  return html`
    <div className="mkt-x-reply">
      <span className="mkt-x-thread-line" aria-hidden=${true}></span>
      <div className="mkt-x-reply-inner">
        <${XCardHeader}
          initials="JL"
          name="Jeff Lindsay"
          handle="@progrium · 6:43 AM · Jun 27, 2026"
          href="https://x.com/progrium/status/2070639004761145654"
          ariaLabel="Open reply on X"
        />
        <p className="mkt-x-body mkt-x-body-reply">i dont know what this means but im pretty sure my answer is in the browser</p>
        <div className="mkt-x-stats">1,236 views</div>
      </div>
    </div>
  `;
}

export function HomeFieldXCard() {
  return html`
    <section className="mkt-page mkt-section" id="mkt-x">
      <div className="mkt-section-label">VOICE FROM THE FIELD</div>
      <h2>“My answer is in the browser.”</h2>
      <p className="lead">When 2,100 agent builders were asked where they host their agents, Jeff Lindsay replied to the thread with this:</p>
      <article className="mkt-x-card">
        <${XCardHeader}
          initials="DL"
          name="David Cramer"
          check=${true}
          handle="@zeeg · Jun 27, 2026"
          href="https://x.com/zeeg/status/2070591092471558567"
          ariaLabel="Open original post on X"
        />
        <p className="mkt-x-body">If you’re building agents, either for internal tools or as part of your product, where are you hosting them?</p>
        <${FieldPoll}/>
        <${FieldReply}/>
      </article>
    </section>
  `;
}
