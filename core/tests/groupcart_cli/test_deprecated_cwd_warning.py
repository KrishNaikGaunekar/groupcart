"""Tests for warn_deprecated_cwd_env_vars() migration warning."""


def _write_env(monkeypatch, tmp_path, content):
    groupcart_home = tmp_path / ".groupcart"
    groupcart_home.mkdir()
    (groupcart_home / ".env").write_text(content, encoding="utf-8")
    monkeypatch.setenv("GROUPCART_HOME", str(groupcart_home))
    return groupcart_home


class TestDeprecatedCwdWarning:
    """Warn when MESSAGING_CWD or TERMINAL_CWD is set in .env."""

    def test_process_environment_does_not_trigger_warning(
        self, monkeypatch, tmp_path, capsys
    ):
        _write_env(monkeypatch, tmp_path, "# TERMINAL_CWD=.\n")
        monkeypatch.setenv("MESSAGING_CWD", "/process/message-path")
        monkeypatch.setenv("TERMINAL_CWD", "/process/terminal-path")

        from groupcart_cli.config import warn_deprecated_cwd_env_vars

        warn_deprecated_cwd_env_vars()

        assert capsys.readouterr().err == ""

    def test_both_deprecated_vars_in_dotenv_warn(
        self, monkeypatch, tmp_path, capsys
    ):
        _write_env(
            monkeypatch,
            tmp_path,
            "MESSAGING_CWD=/msg/path\nTERMINAL_CWD=/term/path\n",
        )
        monkeypatch.delenv("MESSAGING_CWD", raising=False)
        monkeypatch.delenv("TERMINAL_CWD", raising=False)

        from groupcart_cli.config import warn_deprecated_cwd_env_vars

        warn_deprecated_cwd_env_vars()

        captured = capsys.readouterr()
        assert "MESSAGING_CWD" in captured.err
        assert "TERMINAL_CWD" in captured.err
        assert "deprecated" in captured.err.lower()
        assert "config.yaml" in captured.err

    def test_dotenv_terminal_cwd_warns_with_explicit_config(
        self, monkeypatch, tmp_path, capsys
    ):
        groupcart_home = _write_env(
            monkeypatch, tmp_path, "TERMINAL_CWD=/legacy/path\n"
        )
        (groupcart_home / "config.yaml").write_text(
            "terminal:\n  cwd: /current/path\n", encoding="utf-8"
        )

        from groupcart_cli.config import warn_deprecated_cwd_env_vars

        warn_deprecated_cwd_env_vars()

        assert "TERMINAL_CWD=/legacy/path" in capsys.readouterr().err

    def test_commented_and_empty_dotenv_values_do_not_warn(
        self, monkeypatch, tmp_path, capsys
    ):
        _write_env(
            monkeypatch,
            tmp_path,
            "# MESSAGING_CWD=/commented\nTERMINAL_CWD=\n",
        )
        monkeypatch.setenv("TERMINAL_CWD", "/process/bridge")

        from groupcart_cli.config import warn_deprecated_cwd_env_vars

        warn_deprecated_cwd_env_vars()

        assert capsys.readouterr().err == ""

    def test_dotenv_read_failure_is_silent(self, monkeypatch, capsys):
        import groupcart_cli.config as config_module

        def raise_read_error():
            raise OSError("permission denied")

        monkeypatch.setattr(config_module, "load_env", raise_read_error)

        config_module.warn_deprecated_cwd_env_vars()

        assert capsys.readouterr().err == ""
