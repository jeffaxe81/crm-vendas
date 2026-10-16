import importlib.util
from pathlib import Path
import unittest
import tempfile
import subprocess
from unittest.mock import patch
import io
from contextlib import redirect_stdout

SCRIPT = Path(__file__).resolve().parents[1] / 'configurar-endereco.py'

class AddressTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('address', SCRIPT)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_direct_local_and_lan_keep_database_private(self):
        for host in ('127.0.0.1', '192.168.40.84'):
            values = self.module.settings('http://' + host, 'direct')
            self.assertEqual(values['WEB_ORIGIN'], 'http://' + host + ':3000')
            self.assertEqual(values['NEXT_PUBLIC_API_BASE_URL'], 'http://' + host + ':3001/api/v1')
            self.assertNotIn('BIND_ADDRESS', values)
            self.assertEqual(values['WEB_BIND_ADDRESS'], '127.0.0.1' if host == '127.0.0.1' else '0.0.0.0')

    def test_proxy_same_origin_and_private_ports(self):
        values = self.module.settings('https://crm.example.com', 'proxy')
        self.assertEqual(values['NEXT_PUBLIC_API_BASE_URL'], 'https://crm.example.com/api/v1')
        self.assertEqual(values['API_BIND_ADDRESS'], '127.0.0.1')

    def test_reject_ambiguous_or_injected_addresses(self):
        for value in ('http://127.00.1', 'http://x/a', 'https://x?y=1', 'https://a;b', 'http://u:p@x', 'https://x:99999'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.module.settings(value, 'proxy')

    def test_real_tls_certificate_rejects_wrong_host_and_accepts_matching_host(self):
        with tempfile.TemporaryDirectory() as directory:
            cert = Path(directory) / 'cert.pem'
            key = Path(directory) / 'key.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                            '-keyout', str(key), '-out', str(cert), '-days', '1',
                            '-subj', '/CN=crm.example.com', '-addext',
                            'subjectAltName=DNS:crm.example.com'], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.module.validate_certificate(str(cert), 'crm.example.com')
            with self.assertRaises(ValueError):
                self.module.validate_certificate(str(cert), 'wrong.example.com')

    def test_env_preserves_secrets_and_internal_destinations(self):
        original = 'APP_DB_PASSWORD=keep\nDATABASE_URL=postgresql://x@127.0.0.1/db\nWEB_ORIGIN=old\nWEB_ORIGIN=duplicate\n'
        result = self.module.update_env(original, {'WEB_ORIGIN': 'https://crm.example.com'})
        self.assertIn('APP_DB_PASSWORD=keep\n', result)
        self.assertIn('DATABASE_URL=postgresql://x@127.0.0.1/db\n', result)
        self.assertEqual(result.count('WEB_ORIGIN='), 1)

class OperationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        AddressTests.setUpClass()
        cls.module = AddressTests.module

    def exercise(self, fail=False, preview=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.git').mkdir()
            env = root / '.env'
            original = 'APP_DB_PASSWORD=unchanged\nWEB_ORIGIN=http://old:3000\n'
            env.write_text(original)
            calls = []
            states = []
            def command(*args):
                calls.append(args)
                states.append(env.read_text())
                if fail and args[-1] == '--quiet':
                    raise subprocess.CalledProcessError(1, args)
            argv = ['script', 'http://192.168.40.84', '--mode', 'direct']
            if preview:
                argv.append('--check-only')
            with patch.object(self.module, 'ROOT', root), patch.object(self.module, 'run', command), patch('sys.argv', argv), redirect_stdout(io.StringIO()):
                if fail:
                    with self.assertRaises(subprocess.CalledProcessError):
                        self.module.main()
                else:
                    self.module.main()
            return original, env.read_text(), calls, states, len(list(root.glob('crm-endereco-*')))

    def test_preview_does_not_write_or_restart(self):
        original, result, calls, states, backups = self.exercise(preview=True)
        self.assertEqual(original, result)
        self.assertEqual(calls, [])
        self.assertEqual(backups, 0)

    def test_success_recreates_only_api_and_web_with_health_gate(self):
        original, result, calls, states, backups = self.exercise()
        self.assertIn('APP_DB_PASSWORD=unchanged', result)
        self.assertIn('WEB_ORIGIN=http://192.168.40.84:3000', result)
        self.assertEqual(backups, 1)
        restart = calls[-1]
        self.assertEqual(restart[-2:], ('api', 'web'))
        self.assertIn('--no-deps', restart)
        self.assertIn('--wait', restart)
        self.assertNotIn('down', restart)

    def test_invalid_compose_restores_previous_environment(self):
        original, result, calls, states, backups = self.exercise(fail=True)
        self.assertEqual(original, result)
        self.assertEqual(states[-1], original)
        self.assertEqual(calls[-1][-2:], ('api', 'web'))

if __name__ == '__main__':
    unittest.main()
