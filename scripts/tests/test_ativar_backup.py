"""Regression tests for offline backup configuration; never requires Docker."""

import base64
import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "ativar-backup.py"
SPEC = importlib.util.spec_from_file_location("enable_backup", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class BackupActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = Path(self.temp.name) / ".env"

    def test_new_key_keeps_other_env_and_is_private(self):
        self.env.write_text("JWT_ACCESS_SECRET=preserve\nBACKUP_DIRECTORY=\nBACKUP_ENCRYPTION_KEY=\n")
        checked = []
        new_key = module.configure_env(self.env, lambda: checked.append(True))
        self.assertTrue(new_key)
        self.assertEqual(checked, [True])
        values = module.read_settings(self.env.read_text())
        self.assertEqual(values["BACKUP_DIRECTORY"][1], "/var/lib/axes-crm/backups")
        key = values["BACKUP_ENCRYPTION_KEY"][1]
        self.assertEqual(len(base64.b64decode(key, validate=True)), 32)
        self.assertIn("JWT_ACCESS_SECRET=preserve", self.env.read_text())
        self.assertEqual(stat.S_IMODE(self.env.stat().st_mode), 0o600)

    def test_existing_key_remains_identical_across_runs(self):
        key = base64.b64encode(b"x" * 32).decode("ascii")
        self.env.write_text(f"BACKUP_ENCRYPTION_KEY={key}\nBACKUP_DIRECTORY=/var/lib/axes-crm/backups\n")
        original = self.env.read_bytes()
        with patch.object(module, "check_no_previous_backups", side_effect=AssertionError("not needed")):
            self.assertFalse(module.configure_env(self.env))
        self.assertEqual(self.env.read_bytes(), original)

    def test_prior_files_refuse_new_key_and_leave_env_unchanged(self):
        self.env.write_text("BACKUP_ENCRYPTION_KEY=\nBACKUP_DIRECTORY=\n")
        original = self.env.read_bytes()
        def refuse():
            raise RuntimeError("existing encrypted files")
        with self.assertRaisesRegex(RuntimeError, "encrypted files"):
            module.configure_env(self.env, refuse)
        self.assertEqual(self.env.read_bytes(), original)

    def test_other_backup_directory_is_not_overwritten(self):
        self.env.write_text("BACKUP_DIRECTORY=/data/previous\nBACKUP_ENCRYPTION_KEY=\n")
        with self.assertRaisesRegex(ValueError, "diferente"):
            module.configure_env(self.env, lambda: None)

    def test_duplicate_keys_are_rejected(self):
        self.env.write_text("BACKUP_ENCRYPTION_KEY=\nBACKUP_ENCRYPTION_KEY=\n")
        with self.assertRaisesRegex(ValueError, "mais de uma"):
            module.configure_env(self.env, lambda: None)

    def test_invalid_existing_key_is_rejected_without_rotation(self):
        self.env.write_text("BACKUP_ENCRYPTION_KEY=invalid\n")
        with self.assertRaisesRegex(ValueError, "base64"):
            module.configure_env(self.env, lambda: None)

    def test_symlink_to_env_is_rejected(self):
        target = Path(self.temp.name) / "target"
        target.write_text("BACKUP_ENCRYPTION_KEY=\n")
        self.env.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "regular"):
            module.configure_env(self.env, lambda: None)


if __name__ == "__main__":
    unittest.main()
