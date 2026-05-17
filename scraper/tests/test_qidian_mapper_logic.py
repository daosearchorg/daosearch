"""Run: .venv/Scripts/python.exe tests/test_qidian_mapper_logic.py  (cwd = scraper/)"""
import sys
sys.path.insert(0, ".")
from workers.qidian_mapper import decide_assignment


def test_decide_assignment():
    # No qid resolved -> nothing to do.
    assert decide_assignment(resolved_qid=None, owner_book_id=None,
                              this_book_id=10) == ("none", None)
    # qid free -> assign.
    assert decide_assignment(resolved_qid=777, owner_book_id=None,
                              this_book_id=10) == ("assign", 777)
    # qid already owned by THIS book -> idempotent no-op.
    assert decide_assignment(resolved_qid=777, owner_book_id=10,
                             this_book_id=10) == ("noop", 777)
    # qid owned by ANOTHER book -> conflict, never steal.
    assert decide_assignment(resolved_qid=777, owner_book_id=99,
                              this_book_id=10) == ("conflict", 777)


if __name__ == "__main__":
    test_decide_assignment()
    print("OK test_qidian_mapper_logic")
