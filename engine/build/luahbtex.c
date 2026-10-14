#include <stdio.h>
#include <unistd.h>

extern int luahbtex_main(int argc, char **argv);
extern char *__real_kpse_find_file(const char *, int, int);
extern char *kpse_remote_fetch_js(const char *, int);

int main(int argc, char **argv) {
    optind = 1;
    return luahbtex_main(argc, argv);
}

void flush_streams(void) { fflush(NULL); }

char *__wrap_kpse_find_file(const char *name, int format, int must_exist) {
    char *path = __real_kpse_find_file(name, format, must_exist);
    if (!path) path = kpse_remote_fetch_js(name, format);
    return path && access(path, F_OK) == 0 ? path : NULL;
}

// This browser build never launches external commands.
int system(const char *command) { return command ? -1 : 0; }
