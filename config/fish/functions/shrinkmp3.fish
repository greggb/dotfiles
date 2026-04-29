function shrinkmp3 -d "Compress an MP3 file" -a input output
    ffmpeg -i $input -c:a libmp3lame -b:a 192k -ac 2 -ar 44100 -vn $output
end
