"""Unit tests for PTT HTML parsing in crawler.py."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from crawler import extract_article_id, extract_timestamp, parse_ptt_html


def test_extract_article_id_standard():
    href = "/bbs/Gossiping/M.1700000000.A.001.html"
    assert extract_article_id(href) == "M.1700000000.A.001"


def test_extract_article_id_no_match():
    assert extract_article_id("/bbs/Gossiping/index.html") is None


def test_extract_timestamp():
    assert extract_timestamp("M.1700000000.A.001") == 1700000000


def test_extract_timestamp_no_match():
    assert extract_timestamp("invalid") == 0


def test_parse_reply_count_bao():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"><span class="hl f2">爆</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000001.A.001.html">Test爆文</a></div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert len(articles) == 1
    assert articles[0]["replies"] == 100


def test_parse_reply_count_negative():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"><span class="hl f1">X3</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000002.A.001.html">Test負評</a></div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert len(articles) == 1
    assert articles[0]["replies"] == -10


def test_parse_reply_count_integer():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"><span class="hl f3">42</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000003.A.001.html">Test普通</a></div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert len(articles) == 1
    assert articles[0]["replies"] == 42


def test_parse_stops_at_separator():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"><span>5</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000004.A.001.html">Before sep</a></div>
      </div>
      <div class="r-list-sep"></div>
      <div class="r-ent">
        <div class="nrec"><span>5</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000005.A.001.html">After sep</a></div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert len(articles) == 1
    assert articles[0]["title"] == "Before sep"


def test_parse_skips_deleted_articles():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"></div>
        <div class="title">(本文已被刪除)</div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert len(articles) == 0


def test_parse_article_url():
    html = """
    <div class="r-list-container">
      <div class="r-ent">
        <div class="nrec"><span>1</span></div>
        <div class="title"><a href="/bbs/Gossiping/M.1700000006.A.001.html">有連結</a></div>
      </div>
    </div>
    """
    articles = parse_ptt_html(html)
    assert articles[0]["url"] == "https://www.ptt.cc/bbs/Gossiping/M.1700000006.A.001.html"
