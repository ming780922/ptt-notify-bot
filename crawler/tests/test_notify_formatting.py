"""Unit tests for notification message formatting in notify.py."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from notify import highlight_keywords, format_article_time


def test_highlight_single_keyword():
    result = highlight_keywords("特斯拉降價了", ["特斯拉"])
    assert "<b><u>特斯拉</u></b>" in result
    assert "降價了" in result


def test_highlight_case_insensitive():
    result = highlight_keywords("Tesla Model 3", ["tesla"])
    assert "<b><u>Tesla</u></b>" in result


def test_highlight_multiple_keywords():
    result = highlight_keywords("特斯拉 AI 新聞", ["特斯拉", "AI"])
    assert "<b><u>特斯拉</u></b>" in result
    assert "<b><u>AI</u></b>" in result


def test_highlight_multiple_occurrences():
    result = highlight_keywords("特斯拉 特斯拉 特斯拉", ["特斯拉"])
    assert result.count("<b><u>特斯拉</u></b>") == 3


def test_highlight_no_keywords():
    result = highlight_keywords("普通標題", [])
    assert result == "普通標題"
    assert "<b>" not in result


def test_highlight_html_escapes_non_matched():
    result = highlight_keywords("<script>alert(1)</script>特斯拉", ["特斯拉"])
    assert "&lt;script&gt;" in result
    assert "<b><u>特斯拉</u></b>" in result


def test_highlight_empty_title():
    result = highlight_keywords("", ["特斯拉"])
    assert result == ""


def test_format_article_time_valid():
    # M.1700000000.A.001 → timestamp 1700000000 → 2023-11-14 in UTC+8
    result = format_article_time("M.1700000000.A.001")
    assert result != ""
    assert "2023" in result


def test_format_article_time_invalid():
    result = format_article_time("invalid_id")
    assert result == ""


def test_format_article_time_empty():
    result = format_article_time("")
    assert result == ""
