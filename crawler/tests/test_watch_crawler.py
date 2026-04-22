"""Unit tests for watch_crawler reply-count parsing."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from watch_crawler import parse_reply_count


PUSH_HTML = """
<div class="push">
  <span class="push-tag">推 </span>
  <span class="push-userid">user1</span>
  <span class="push-content">: 推</span>
</div>
<div class="push">
  <span class="push-tag">→ </span>
  <span class="push-userid">user2</span>
  <span class="push-content">: 中立</span>
</div>
<div class="push">
  <span class="push-tag">噓 </span>
  <span class="push-userid">user3</span>
  <span class="push-content">: 不推</span>
</div>
"""

EMPTY_HTML = """
<div id="main-content">
  <div class="article-content">文章內容</div>
</div>
"""


def test_parse_all_push_types():
    assert parse_reply_count(PUSH_HTML) == 3


def test_parse_empty_article():
    assert parse_reply_count(EMPTY_HTML) == 0


def test_parse_single_push():
    html = '<div class="push"><span class="push-tag">推 </span></div>'
    assert parse_reply_count(html) == 1


def test_parse_invalid_html():
    assert parse_reply_count("not html at all") == 0


def test_parse_empty_string():
    assert parse_reply_count("") == 0


def test_parse_counts_all_types_equally():
    html = """
    <div class="push"><span class="push-tag">推 </span></div>
    <div class="push"><span class="push-tag">推 </span></div>
    <div class="push"><span class="push-tag">噓 </span></div>
    <div class="push"><span class="push-tag">→ </span></div>
    """
    assert parse_reply_count(html) == 4
