import json
import unittest
from unittest.mock import MagicMock, patch

from app.ai_client import _gemini


class GeminiClientTest(unittest.TestCase):
    @patch("app.ai_client.request.urlopen")
    def test_gemini_uses_rest_and_reads_text_parts(self, urlopen: MagicMock):
        response = MagicMock()
        response.read.return_value = json.dumps({
            "candidates": [{
                "content": {"parts": [{"text": "アリアの"}, {"text": "コメント"}]},
            }],
        }).encode("utf-8")
        urlopen.return_value.__enter__.return_value = response

        result = _gemini("今週を見て", 0.8)

        self.assertEqual(result, "アリアのコメント")
        api_request = urlopen.call_args.args[0]
        self.assertIn(":generateContent", api_request.full_url)
        payload = json.loads(api_request.data.decode("utf-8"))
        self.assertEqual(payload["generationConfig"]["thinkingConfig"]["thinkingLevel"], "minimal")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 15)


if __name__ == "__main__":
    unittest.main()
