from tqdm import tqdm
from typing import Any, Optional, Iterable


class NewTqdm(tqdm):
    """
    一个继承自 tqdm 的进度条类，实时更新task_progress。
    """
    def __init__(
        self,
        iterable: Optional[Iterable] = None,
        callback: Optional[Any] = None,
        **kwargs
    ):
    #其余参数继承 tqdm
        super().__init__(iterable, **kwargs)
        self.callback = callback

    def update(self, n: int = 1) -> Optional[bool]:
        """在原 update 之后，把进度同步到 task_progress"""
        ret = super().update(n)
        if self.callback is not None:
            progress = 30 + int((self.n / max(self.total, 1)) * 50)  #进度由30开始到80
            self.callback(progress,"generating")
        return ret