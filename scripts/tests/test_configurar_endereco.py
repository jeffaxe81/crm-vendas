import importlib.util
from pathlib import Path
import unittest

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

    def test_env_preserves_secrets_and_internal_destinations(self):
        original = 'APP_DB_PASSWORD=keep\nDATABASE_URL=postgresql://x@127.0.0.1/db\nWEB_ORIGIN=old\nWEB_ORIGIN=duplicate\n'
        result = self.module.update_env(original, {'WEB_ORIGIN': 'https://crm.example.com'})
        self.assertIn('APP_DB_PASSWORD=keep\n', result)
        self.assertIn('DATABASE_URL=postgresql://x@127.0.0.1/db\n', result)
        self.assertEqual(result.count('WEB_ORIGIN='), 1)

if __name__ == '__main__':
    unittest.main()
